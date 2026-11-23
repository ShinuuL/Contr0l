//! Lançamento por foto/cupom com Gemini (Fase 2).
//!
//! A chave da API fica cifrada localmente em `app_config_dir`:
//! - `gemini-master.key`: chave local aleatória de 32 bytes (base64 URL-safe)
//! - `gemini-api.enc`: envelope XChaCha20-Poly1305 contendo a API key
//!
//! O mesmo trade-off do `session_store`: a pasta do app já guarda o `.db` em
//! texto puro; proteger a chave de API com criptografia local evita exposição
//! acidental em logs/backups simples, mas não protege contra quem tem acesso
//! total ao perfil do usuário. A chave nunca é exposta ao frontend.

use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

use crate::crypto::{generate_dek, open_envelope, seal_envelope, Key};

const MASTER_KEY_FILE: &str = "gemini-master.key";
const API_KEY_FILE: &str = "gemini-api.enc";
const GEMINI_MODEL: &str = "gemini-2.0-flash";
const GEMINI_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CupomPreview {
    pub description: String,
    pub amount_cents: i64,
    pub date: String,
    pub nature: String,
    pub suggested_category: Option<String>,
    pub confidence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
    error: Option<GeminiError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiContent {
    parts: Option<Vec<GeminiPart>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiError {
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CupomJson {
    description: Option<String>,
    amount_cents: Option<i64>,
    amount: Option<f64>,
    date: Option<String>,
    nature: Option<String>,
    suggested_category: Option<String>,
    confidence: Option<String>,
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Não foi possível obter a pasta de configuração: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Não foi possível criar a pasta de configuração: {e}"))?;
    Ok(dir)
}

#[cfg(unix)]
fn restringir_permissoes(caminho: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(caminho, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restringir_permissoes(_caminho: &Path) {}

fn master_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(MASTER_KEY_FILE))
}

fn api_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(API_KEY_FILE))
}

fn carregar_ou_criar_master_key(app: &AppHandle) -> Result<Key, String> {
    let path = master_key_path(app)?;
    if path.exists() {
        let b64 = std::fs::read_to_string(&path)
            .map_err(|e| format!("Não foi possível ler a chave local: {e}"))?;
        let bytes = URL_SAFE_NO_PAD
            .decode(b64.trim())
            .map_err(|_| "Chave local inválida.".to_string())?;
        if bytes.len() != 32 {
            return Err("Chave local inválida.".to_string());
        }
        let mut key: Key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    let key = generate_dek();
    let b64 = URL_SAFE_NO_PAD.encode(key.as_ref());
    std::fs::write(&path, b64)
        .map_err(|e| format!("Não foi possível salvar a chave local: {e}"))?;
    restringir_permissoes(&path);
    Ok(key)
}

fn salvar_api_key(app: &AppHandle, api_key: &str) -> Result<(), String> {
    let key = carregar_ou_criar_master_key(app)?;
    let envelope = seal_envelope(api_key.trim().as_bytes(), &key);
    let path = api_key_path(app)?;
    std::fs::write(&path, envelope)
        .map_err(|e| format!("Não foi possível salvar a chave da API: {e}"))?;
    restringir_permissoes(&path);
    Ok(())
}

fn carregar_api_key(app: &AppHandle) -> Result<String, String> {
    let path = api_key_path(app)?;
    if !path.exists() {
        return Err("Chave da API do Gemini não configurada.".to_string());
    }
    let envelope = std::fs::read(&path)
        .map_err(|e| format!("Não foi possível ler a chave da API: {e}"))?;
    let master = carregar_ou_criar_master_key(app)?;
    let plain = open_envelope(&envelope, &master)
        .map_err(|_| "Não foi possível decifrar a chave da API. Configure-a novamente.".to_string())?;
    let api_key = String::from_utf8(plain)
        .map_err(|_| "Chave da API inválida. Configure-a novamente.".to_string())?;
    let trimmed = api_key.trim().to_string();
    if trimmed.is_empty() {
        return Err("Chave da API do Gemini não configurada.".to_string());
    }
    Ok(trimmed)
}

fn validar_api_key(api_key: &str) -> Result<&str, String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("Informe a chave da API do Gemini.".to_string());
    }
    if trimmed.len() < 10 || trimmed.len() > 256 {
        return Err("Chave da API do Gemini inválida.".to_string());
    }
    if trimmed.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("Chave da API do Gemini inválida.".to_string());
    }
    Ok(trimmed)
}

fn validar_mime_type(mime_type: &str) -> Result<&str, String> {
    match mime_type {
        "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif" => Ok(mime_type),
        _ => Err("Formato de imagem não suportado. Use JPEG, PNG, WEBP ou HEIC.".to_string()),
    }
}

fn extrair_json_do_texto(texto: &str) -> Option<&str> {
    let trimmed = texto.trim();
    if trimmed.starts_with('{') {
        return Some(trimmed);
    }
    // Tenta extrair bloco ```json ... ``` ou ``` ... ```
    if let Some(inicio) = trimmed.find("```json") {
        let resto = &trimmed[inicio + 7..];
        if let Some(fim) = resto.find("```") {
            return Some(resto[..fim].trim());
        }
    }
    if let Some(inicio) = trimmed.find("```") {
        let resto = &trimmed[inicio + 3..];
        let resto = resto.strip_prefix('\n').unwrap_or(resto);
        if let Some(fim) = resto.find("```") {
            let candidato = resto[..fim].trim();
            if candidato.starts_with('{') {
                return Some(candidato);
            }
        }
    }
    // Fallback: primeiro '{' até último '}'
    let inicio = trimmed.find('{')?;
    let fim = trimmed.rfind('}')?;
    if fim > inicio {
        Some(&trimmed[inicio..=fim])
    } else {
        None
    }
}

fn normalizar_data(date: &str) -> Result<String, String> {
    let d = date.trim();
    // Aceita YYYY-MM-DD
    let parts: Vec<&str> = d.split('-').collect();
    if parts.len() == 3 && parts[0].len() == 4 && parts[1].len() == 2 && parts[2].len() == 2 {
        let y: i32 = parts[0].parse().map_err(|_| "Data inválida no cupom.".to_string())?;
        let m: u32 = parts[1].parse().map_err(|_| "Data inválida no cupom.".to_string())?;
        let day: u32 = parts[2].parse().map_err(|_| "Data inválida no cupom.".to_string())?;
        if (2000..=2100).contains(&y) && (1..=12).contains(&m) && (1..=31).contains(&day) {
            return Ok(format!("{y:04}-{m:02}-{day:02}"));
        }
    }
    // Aceita DD/MM/YYYY
    let parts: Vec<&str> = d.split('/').collect();
    if parts.len() == 3 && parts[0].len() == 2 && parts[1].len() == 2 && parts[2].len() == 4 {
        let day: u32 = parts[0].parse().map_err(|_| "Data inválida no cupom.".to_string())?;
        let m: u32 = parts[1].parse().map_err(|_| "Data inválida no cupom.".to_string())?;
        let y: i32 = parts[2].parse().map_err(|_| "Data inválida no cupom.".to_string())?;
        if (2000..=2100).contains(&y) && (1..=12).contains(&m) && (1..=31).contains(&day) {
            return Ok(format!("{y:04}-{m:02}-{day:02}"));
        }
    }
    Err("Data do cupom inválida. Use o formato AAAA-MM-DD.".to_string())
}

fn normalizar_natureza(nature: &str) -> String {
    let n = nature.trim().to_lowercase();
    if n.contains("entrada") || n.contains("receita") || n.contains("credito") || n.contains("crédito") {
        "entrada".to_string()
    } else {
        "saida".to_string()
    }
}

fn amount_to_cents(amount: f64) -> Result<i64, String> {
    if !amount.is_finite() || amount <= 0.0 {
        return Err("Valor do cupom inválido.".to_string());
    }
    let cents = (amount * 100.0).round() as i64;
    if cents <= 0 {
        return Err("Valor do cupom inválido.".to_string());
    }
    Ok(cents)
}

fn parse_cupom_preview(texto: &str) -> Result<CupomPreview, String> {
    let json_str = extrair_json_do_texto(texto)
        .ok_or_else(|| "Não foi possível interpretar a resposta do Gemini.".to_string())?;
    let parsed: CupomJson = serde_json::from_str(json_str)
        .map_err(|_| "Resposta do Gemini em formato inválido.".to_string())?;

    let description = parsed
        .description
        .unwrap_or_default()
        .trim()
        .chars()
        .take(120)
        .collect::<String>();
    let description = if description.is_empty() {
        "Lançamento por cupom".to_string()
    } else {
        description
    };

    let amount_cents = if let Some(cents) = parsed.amount_cents {
        if cents <= 0 {
            return Err("Valor do cupom inválido.".to_string());
        }
        cents
    } else if let Some(amount) = parsed.amount {
        amount_to_cents(amount)?
    } else {
        return Err("O Gemini não identificou o valor do cupom.".to_string());
    };

    let date = parsed.date.unwrap_or_default();
    let date = normalizar_data(&date)?;

    let nature = normalizar_natureza(parsed.nature.as_deref().unwrap_or("saida"));

    let suggested_category = parsed
        .suggested_category
        .map(|s| s.trim().chars().take(60).collect::<String>())
        .filter(|s| !s.is_empty());

    let confidence = parsed
        .confidence
        .map(|s| s.trim().to_lowercase())
        .filter(|s| matches!(s.as_str(), "alta" | "media" | "baixa"));

    Ok(CupomPreview {
        description,
        amount_cents,
        date,
        nature,
        suggested_category,
        confidence,
    })
}

async fn chamar_gemini(api_key: &str, image_base64: &str, mime_type: &str) -> Result<String, String> {
    let url = format!("{GEMINI_ENDPOINT}/{GEMINI_MODEL}:generateContent?key={api_key}");
    let prompt = r#"Você extrai dados de cupom fiscal/nota para um app de controle financeiro.
Responda SOMENTE com JSON válido (sem markdown, sem texto extra), no formato:
{
  "description": "descrição curta do estabelecimento ou compra",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "nature": "saida",
  "suggested_category": "nome de categoria sugerida ou null",
  "confidence": "alta|media|baixa"
}
Regras:
- amount é o valor total pago, número decimal com ponto.
- date no formato YYYY-MM-DD; se não encontrar, use a data de hoje.
- nature: "saida" para compras/gastos, "entrada" para reembolso/estorno.
- suggested_category: sugestão simples (ex: Alimentação, Transporte, Saúde) ou null.
- confidence: sua confiança na extração.
"#;
    let body = serde_json::json!({
        "contents": [{
            "parts": [
                { "text": prompt },
                { "inline_data": { "mime_type": mime_type, "data": image_base64 } }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 512,
            "responseMimeType": "application/json"
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Não foi possível iniciar a requisição: {e}"))?;

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|_| "Falha ao conectar ao Gemini. Verifique sua conexão.".to_string())?;

    let status = resp.status();
    let texto = resp
        .text()
        .await
        .map_err(|_| "Resposta inválida do Gemini.".to_string())?;

    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<GeminiResponse>(&texto) {
            if let Some(e) = err.error.and_then(|e| e.message) {
                // Não vazar a chave; mensagem da API é segura.
                return Err(format!("Gemini recusou a solicitação: {e}"));
            }
        }
        return Err(format!("Gemini retornou erro ({status})."));
    }

    let parsed: GeminiResponse = serde_json::from_str(&texto)
        .map_err(|_| "Resposta inválida do Gemini.".to_string())?;
    let text = parsed
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .and_then(|p| p.into_iter().find_map(|part| part.text))
        .ok_or_else(|| "O Gemini não retornou dados do cupom.".to_string())?;
    Ok(text)
}

#[tauri::command]
pub fn gemini_configurar_chave(app: AppHandle, api_key: String) -> Result<bool, String> {
    let key = validar_api_key(&api_key)?;
    salvar_api_key(&app, key)?;
    Ok(true)
}

#[tauri::command]
pub fn gemini_remover_chave(app: AppHandle) -> Result<bool, String> {
    let path = api_key_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Não foi possível remover a chave da API: {e}"))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn gemini_tem_chave(app: AppHandle) -> Result<bool, String> {
    Ok(api_key_path(&app)?.exists())
}

#[tauri::command]
pub async fn gemini_analisar_cupom(
    app: AppHandle,
    image_base64: String,
    mime_type: String,
) -> Result<CupomPreview, String> {
    let mime = validar_mime_type(mime_type.trim())?;
    let img = image_base64.trim();
    if img.is_empty() {
        return Err("Imagem do cupom não informada.".to_string());
    }
    // Limite bruto ~6MB em base64 (~4.5MB binário)
    if img.len() > 6_000_000 {
        return Err("Imagem muito grande. Use uma foto menor (até ~4 MB).".to_string());
    }

    let api_key = carregar_api_key(&app)?;
    let texto = chamar_gemini(&api_key, img, mime).await?;
    parse_cupom_preview(&texto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extrai_json_direto() {
        let txt = r#"{"description":"Mercado","amount":10.5,"date":"2026-11-23","nature":"saida","suggested_category":"Alimentação","confidence":"alta"}"#;
        let p = parse_cupom_preview(txt).unwrap();
        assert_eq!(p.description, "Mercado");
        assert_eq!(p.amount_cents, 1050);
        assert_eq!(p.date, "2026-11-23");
        assert_eq!(p.nature, "saida");
        assert_eq!(p.suggested_category.as_deref(), Some("Alimentação"));
    }

    #[test]
    fn extrai_json_de_markdown() {
        let txt = "```json\n{\"description\":\"Padaria\",\"amount\":12.0,\"date\":\"2026-11-20\",\"nature\":\"saida\"}\n```";
        let p = parse_cupom_preview(txt).unwrap();
        assert_eq!(p.description, "Padaria");
        assert_eq!(p.amount_cents, 1200);
    }

    #[test]
    fn aceita_amount_cents() {
        let txt = r#"{"description":"Teste","amount_cents":1234,"date":"2026-11-20","nature":"saida"}"#;
        let p = parse_cupom_preview(txt).unwrap();
        assert_eq!(p.amount_cents, 1234);
    }

    #[test]
    fn normaliza_data_br() {
        let txt = r#"{"description":"Teste","amount":1,"date":"23/11/2026","nature":"saida"}"#;
        let p = parse_cupom_preview(txt).unwrap();
        assert_eq!(p.date, "2026-11-23");
    }

    #[test]
    fn rejeita_sem_valor() {
        let txt = r#"{"description":"Teste","date":"2026-11-20","nature":"saida"}"#;
        let err = parse_cupom_preview(txt).unwrap_err();
        assert!(err.contains("valor"));
    }

    #[test]
    fn normaliza_natureza() {
        assert_eq!(normalizar_natureza("entrada"), "entrada");
        assert_eq!(normalizar_natureza("receita"), "entrada");
        assert_eq!(normalizar_natureza("saida"), "saida");
        assert_eq!(normalizar_natureza("qualquer"), "saida");
    }

    #[test]
    fn valida_mime() {
        assert!(validar_mime_type("image/jpeg").is_ok());
        assert!(validar_mime_type("application/pdf").is_err());
    }

    #[test]
    fn valida_api_key() {
        assert!(validar_api_key("").is_err());
        assert!(validar_api_key("short").is_err());
        assert!(validar_api_key("AIzaSyA-valid-looking-key-123456").is_ok());
    }
}
