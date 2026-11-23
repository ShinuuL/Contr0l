use std::{net::SocketAddr, path::PathBuf};

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    middleware::{self, Next},
    response::Response,
};
use rand::RngCore;
use rmcp::{
    ErrorData as McpError, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::*,
    schemars, tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

const DISCOVERY_FILE: &str = "mcp-discovery.json";
const GENERIC_DB_ERROR: &str = "Erro interno ao acessar o banco de dados.";
const MAX_DESCRIPTION_LEN: usize = 500;

#[derive(Clone)]
pub struct McpRuntime {
    #[allow(dead_code)]
    pub port: u16,
    #[allow(dead_code)]
    pub token: String,
    pub discovery_path: PathBuf,
    shutdown: CancellationToken,
}

impl McpRuntime {
    pub fn shutdown(&self) {
        self.shutdown.cancel();
        let _ = std::fs::remove_file(&self.discovery_path);
    }
}

#[derive(Debug, Serialize)]
struct DiscoveryFile {
    host: String,
    port: u16,
    token: String,
    pid: u32,
    started_at: String,
    endpoint: String,
}

#[derive(Clone)]
struct AuthState {
    token: String,
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_string)
}

async fn auth_middleware(
    State(state): State<AuthState>,
    headers: HeaderMap,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    match extract_bearer(&headers) {
        Some(token) if token == state.token => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

fn database_url(app: &AppHandle) -> Result<String, String> {
    let path: PathBuf = app
        .path()
        .app_config_dir()
        .map_err(|_| "Não foi possível localizar o diretório de configuração.".to_string())?
        .join("controle-de-gastos.db");
    let path = path
        .to_str()
        .ok_or_else(|| "Caminho do banco inválido.".to_string())?;
    Ok(format!("sqlite:{path}"))
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn now_iso() -> String {
    // ISO-8601 simples em UTC sem dependência extra.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Formato mínimo suficiente para descoberta local; agente só precisa saber que é recente.
    format!("unix:{secs}")
}

fn validate_description(description: &str) -> Result<String, McpError> {
    if description.len() > MAX_DESCRIPTION_LEN {
        return Err(McpError::invalid_params(
            "A descrição deve ter no máximo 500 caracteres.",
            None,
        ));
    }
    Ok(description.trim().to_string())
}

fn validate_amount(amount_cents: i64) -> Result<i64, McpError> {
    if amount_cents <= 0 {
        return Err(McpError::invalid_params(
            "Informe um valor válido maior que zero.",
            None,
        ));
    }
    Ok(amount_cents)
}

fn validate_date(date: &str) -> Result<String, McpError> {
    let parts: Vec<_> = date.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return Err(McpError::invalid_params("Informe uma data válida (YYYY-MM-DD).", None));
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        parts[0].parse::<u32>(),
        parts[1].parse::<u32>(),
        parts[2].parse::<u32>(),
    ) else {
        return Err(McpError::invalid_params("Informe uma data válida (YYYY-MM-DD).", None));
    };
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => return Err(McpError::invalid_params("Informe uma data válida (YYYY-MM-DD).", None)),
    };
    if day < 1 || day > days {
        return Err(McpError::invalid_params("Informe uma data válida (YYYY-MM-DD).", None));
    }
    Ok(date.to_string())
}

fn validate_nature(nature: &str) -> Result<String, McpError> {
    match nature {
        "entrada" | "saida" => Ok(nature.to_string()),
        _ => Err(McpError::invalid_params(
            "Informe uma natureza válida: 'entrada' ou 'saida'.",
            None,
        )),
    }
}

fn validate_status(status: &str) -> Result<String, McpError> {
    match status {
        "previsto" | "realizado" => Ok(status.to_string()),
        _ => Err(McpError::invalid_params(
            "Informe um status válido: 'previsto' ou 'realizado'.",
            None,
        )),
    }
}

fn validate_category_id(category_id: &str) -> Result<String, McpError> {
    let value = category_id.trim();
    if value.is_empty() {
        return Err(McpError::invalid_params("Informe uma categoria válida.", None));
    }
    Ok(value.to_string())
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTransactionParams {
    #[schemars(description = "ID da categoria (obtido via list_categories)")]
    pub category_id: String,
    #[schemars(description = "Descrição da movimentação")]
    pub description: String,
    #[schemars(description = "Valor em centavos (inteiro positivo). Ex.: 4990 = R$ 49,90")]
    pub amount_cents: i64,
    #[schemars(description = "Data no formato YYYY-MM-DD")]
    pub date: String,
    #[schemars(description = "Natureza: 'entrada' ou 'saida'")]
    pub nature: String,
    #[schemars(description = "Status: 'previsto' ou 'realizado'")]
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct CategoryInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub is_preset: bool,
    pub budget_monthly: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct CreatedTransaction {
    pub id: String,
    pub category_id: String,
    pub description: String,
    pub amount_cents: i64,
    pub date: String,
    pub nature: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct Contr0lMcp {
    pool: SqlitePool,
    #[allow(dead_code)]
    tool_router: ToolRouter<Contr0lMcp>,
}

#[tool_router]
impl Contr0lMcp {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Lista categorias disponíveis no Contr0l. Use antes de create_transaction para obter um category_id válido."
    )]
    async fn list_categories(&self) -> Result<CallToolResult, McpError> {
        let rows = sqlx::query_as::<_, (String, String, String, String, i64, Option<i64>)>(
            "SELECT id, name, icon, color, is_preset, budget_monthly FROM categories ORDER BY sort_order ASC, name ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|_| McpError::internal_error(GENERIC_DB_ERROR.to_string(), None))?;

        let categories: Vec<CategoryInfo> = rows
            .into_iter()
            .map(|(id, name, icon, color, is_preset, budget_monthly)| CategoryInfo {
                id,
                name,
                icon,
                color,
                is_preset: is_preset != 0,
                budget_monthly,
            })
            .collect();

        let json = serde_json::to_string_pretty(&categories)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![ContentBlock::text(json)]))
    }

    #[tool(
        description = "Cria uma movimentação no Contr0l. Valida os campos, verifica se a categoria existe e insere no banco local. amount_cents é inteiro positivo (4990 = R$ 49,90)."
    )]
    async fn create_transaction(
        &self,
        Parameters(params): Parameters<CreateTransactionParams>,
    ) -> Result<CallToolResult, McpError> {
        let category_id = validate_category_id(&params.category_id)?;
        let description = validate_description(&params.description)?;
        let amount_cents = validate_amount(params.amount_cents)?;
        let date = validate_date(&params.date)?;
        let nature = validate_nature(&params.nature)?;
        let status = validate_status(&params.status)?;

        let exists = sqlx::query_scalar::<_, Option<String>>(
            "SELECT id FROM categories WHERE id = $1",
        )
        .bind(&category_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|_| McpError::internal_error(GENERIC_DB_ERROR.to_string(), None))?;

        if exists.is_none() {
            return Err(McpError::invalid_params(
                "Categoria não encontrada. Use list_categories para obter um ID válido.",
                None,
            ));
        }

        let id = sqlx::query_scalar::<_, String>(
            "SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|_| McpError::internal_error(GENERIC_DB_ERROR.to_string(), None))?;

        let now = chrono_like_now();

        sqlx::query(
            "INSERT INTO expenses (id, category_id, description, amount_cents, date, nature, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)",
        )
        .bind(&id)
        .bind(&category_id)
        .bind(&description)
        .bind(amount_cents)
        .bind(&date)
        .bind(&nature)
        .bind(&status)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|_| McpError::internal_error(GENERIC_DB_ERROR.to_string(), None))?;

        let created = CreatedTransaction {
            id,
            category_id,
            description,
            amount_cents,
            date,
            nature,
            status,
            created_at: now.clone(),
            updated_at: now,
        };
        let json = serde_json::to_string_pretty(&created)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![ContentBlock::text(json)]))
    }
}

fn chrono_like_now() -> String {
    // Mantém formato ISO-8601 UTC compatível com o restante do app (JS toISOString-like).
    // Sem puxar chrono; usamos time do std.
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();
    // Conversão manual simples para YYYY-MM-DDTHH:MM:SS.mmmZ
    let days = secs.div_euclid(86_400);
    let day_secs = secs.rem_euclid(86_400);
    let h = day_secs / 3600;
    let m = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z")
}

// Algoritmo civil_from_days (Howard Hinnant), domínio público.
fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year as i32, m, d)
}

#[tool_handler]
impl ServerHandler for Contr0lMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .build(),
        )
        .with_server_info(Implementation::new("contr0l-mcp", env!("CARGO_PKG_VERSION")))
        .with_instructions(
            "Servidor MCP local do Contr0l. Use list_categories para descobrir categorias e create_transaction para lançar movimentações. amount_cents é inteiro positivo em centavos.".to_string(),
        )
    }
}

pub async fn start(app: &AppHandle) -> Result<McpRuntime, String> {
    let database_url = database_url(app)?;
    let pool = SqlitePool::connect(&database_url)
        .await
        .map_err(|e| format!("Falha ao conectar banco para MCP: {e}"))?;

    let token = generate_token();
    let shutdown = CancellationToken::new();

    let service: StreamableHttpService<Contr0lMcp, LocalSessionManager> =
        StreamableHttpService::new(
            {
                let pool = pool.clone();
                move || Ok(Contr0lMcp::new(pool.clone()))
            },
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default().with_cancellation_token(shutdown.child_token()),
        );

    let auth_state = AuthState {
        token: token.clone(),
    };

    let protected_mcp = Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(auth_state, auth_middleware));

    let app_router = Router::new().merge(protected_mcp);

    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .await
        .map_err(|e| format!("Falha ao iniciar servidor MCP: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Falha ao obter porta MCP: {e}"))?
        .port();

    let discovery_path = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Falha ao obter config dir: {e}"))?
        .join(DISCOVERY_FILE);

    if let Some(parent) = discovery_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Falha ao criar dir de descoberta MCP: {e}"))?;
    }

    let discovery = DiscoveryFile {
        host: "127.0.0.1".to_string(),
        port,
        token: token.clone(),
        pid: std::process::id(),
        started_at: now_iso(),
        endpoint: format!("http://127.0.0.1:{port}/mcp"),
    };
    let json = serde_json::to_string_pretty(&discovery)
        .map_err(|e| format!("Falha ao serializar descoberta MCP: {e}"))?;
    std::fs::write(&discovery_path, json)
        .map_err(|e| format!("Falha ao escrever descoberta MCP: {e}"))?;

    let shutdown_for_server = shutdown.clone();
    let discovery_path_for_cleanup = discovery_path.clone();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app_router)
            .with_graceful_shutdown(async move {
                shutdown_for_server.cancelled().await;
            })
            .await;
        let _ = std::fs::remove_file(discovery_path_for_cleanup);
    });

    Ok(McpRuntime {
        port,
        token,
        discovery_path,
        shutdown,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::handler::server::wrapper::Parameters;
    use sqlx::{sqlite::SqlitePoolOptions, Executor};

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory SQLite pool");
        pool.execute(
            "CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, is_preset INTEGER NOT NULL DEFAULT 0, budget_monthly INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, nature TEXT NOT NULL DEFAULT 'saida')",
        )
        .await
        .expect("categories schema");
        pool.execute(
            "CREATE TABLE expenses (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL, date TEXT NOT NULL, nature TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, import_fingerprint TEXT UNIQUE)",
        )
        .await
        .expect("expenses schema");
        pool
    }

    async fn seed_category(pool: &SqlitePool, id: &str, name: &str) {
        sqlx::query(
            "INSERT INTO categories (id, name, icon, color, is_preset, sort_order, created_at) VALUES ($1, $2, 'tag', '#000000', 0, 0, '2026-01-01T00:00:00.000Z')",
        )
        .bind(id)
        .bind(name)
        .execute(pool)
        .await
        .expect("seed category");
    }

    fn text_from_result(result: CallToolResult) -> String {
        result
            .content
            .into_iter()
            .find_map(|block| match block {
                ContentBlock::Text(text) => Some(text.text),
                _ => None,
            })
            .expect("text content")
    }

    #[test]
    fn valida_campos_basicos() {
        assert_eq!(validate_description(" Mercado ").unwrap(), "Mercado");
        assert!(validate_description(&"a".repeat(501)).is_err());
        assert_eq!(validate_amount(4990).unwrap(), 4990);
        assert!(validate_amount(0).is_err());
        assert!(validate_amount(-1).is_err());
        assert_eq!(validate_date("2026-11-23").unwrap(), "2026-11-23");
        assert!(validate_date("2026-02-30").is_err());
        assert!(validate_date("23-11-2026").is_err());
        assert_eq!(validate_nature("saida").unwrap(), "saida");
        assert_eq!(validate_nature("entrada").unwrap(), "entrada");
        assert!(validate_nature("despesa").is_err());
        assert_eq!(validate_status("realizado").unwrap(), "realizado");
        assert_eq!(validate_status("previsto").unwrap(), "previsto");
        assert!(validate_status("pago").is_err());
        assert_eq!(validate_category_id(" cat-1 ").unwrap(), "cat-1");
        assert!(validate_category_id("  ").is_err());
    }

    #[tokio::test]
    async fn list_categories_retorna_categorias_ordenadas() {
        let pool = test_pool().await;
        seed_category(&pool, "b", "Transporte").await;
        seed_category(&pool, "a", "Alimentação").await;
        let mcp = Contr0lMcp::new(pool);

        let result = mcp.list_categories().await.expect("list categories");
        let json = text_from_result(result);
        let categories: Vec<CategoryInfo> = serde_json::from_str(&json).expect("parse categories");

        assert_eq!(categories.len(), 2);
        assert_eq!(categories[0].name, "Alimentação");
        assert_eq!(categories[1].name, "Transporte");
    }

    #[tokio::test]
    async fn create_transaction_insere_e_retorna_movimentacao() {
        let pool = test_pool().await;
        seed_category(&pool, "cat-food", "Alimentação").await;
        let mcp = Contr0lMcp::new(pool.clone());

        let result = mcp
            .create_transaction(Parameters(CreateTransactionParams {
                category_id: "cat-food".to_string(),
                description: "Mercado".to_string(),
                amount_cents: 4990,
                date: "2026-11-23".to_string(),
                nature: "saida".to_string(),
                status: "realizado".to_string(),
            }))
            .await
            .expect("create transaction");
        let created: CreatedTransaction =
            serde_json::from_str(&text_from_result(result)).expect("parse created");

        assert_eq!(created.category_id, "cat-food");
        assert_eq!(created.description, "Mercado");
        assert_eq!(created.amount_cents, 4990);
        assert_eq!(created.date, "2026-11-23");
        assert_eq!(created.nature, "saida");
        assert_eq!(created.status, "realizado");
        assert!(!created.id.is_empty());

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expenses WHERE id = $1")
            .bind(&created.id)
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn create_transaction_rejeita_categoria_inexistente() {
        let pool = test_pool().await;
        let mcp = Contr0lMcp::new(pool);

        let err = mcp
            .create_transaction(Parameters(CreateTransactionParams {
                category_id: "missing".to_string(),
                description: "Mercado".to_string(),
                amount_cents: 4990,
                date: "2026-11-23".to_string(),
                nature: "saida".to_string(),
                status: "realizado".to_string(),
            }))
            .await
            .expect_err("should fail");

        assert!(err.message.contains("Categoria não encontrada"));
    }

    #[tokio::test]
    async fn create_transaction_rejeita_dados_invalidos() {
        let pool = test_pool().await;
        seed_category(&pool, "cat-food", "Alimentação").await;
        let mcp = Contr0lMcp::new(pool);

        let err = mcp
            .create_transaction(Parameters(CreateTransactionParams {
                category_id: "cat-food".to_string(),
                description: "Mercado".to_string(),
                amount_cents: 0,
                date: "2026-11-23".to_string(),
                nature: "saida".to_string(),
                status: "realizado".to_string(),
            }))
            .await
            .expect_err("should fail");

        assert!(err.message.contains("valor válido"));
    }
}
