mod cloud;
mod session_store;
// O envelope do backup (seal/open) ja esta pronto e testado, mas so passa a ser
// chamado no passo do backup; ate la o dead_code seria ruido, nao aviso.
#[allow(dead_code)]
mod crypto;
#[cfg(debug_assertions)]
mod dev_tools;
mod gemini;
mod imports;
mod instalador;
mod mcp;
mod migrations;
mod recovery;
mod update;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:controle-de-gastos.db", migrations::migrations())
                .build(),
        )
        .plugin(instalador::init())
        .manage(cloud::CloudState::default())
        // Antes da webview e antes de qualquer conexao SQLite: e a unica janela
        // em que trocar o arquivo do banco e seguro.
        .setup(|app| {
            cloud::aplicar_restauracao_pendente(app.handle());
            // Depois da restauracao: o banco que vale e o que acabou de entrar.
            recovery::curar_carimbo_sem_efeito(app.handle());
            match tauri::async_runtime::block_on(mcp::start(app.handle())) {
                Ok(runtime) => {
                    app.manage(runtime);
                }
                Err(err) => {
                    eprintln!("MCP local não iniciado: {err}");
                }
            }
            Ok(())
        })
        .invoke_handler({
            #[cfg(debug_assertions)]
            {
                tauri::generate_handler![
                    cloud::cloud_signup,
                    cloud::cloud_login,
                    cloud::cloud_logout,
                    cloud::cloud_sessao,
                    cloud::cloud_entitlement,
                    cloud::cloud_backup_push,
                    cloud::cloud_backup_pull,
                    cloud::cloud_backup_auto,
                    cloud::cloud_apagar_conta,
                    imports::confirm_statement_import,
                    recovery::diagnose_database,
                    update::atualizacao_verificar,
                    update::atualizacao_dispensar,
                    update::atualizacao_baixar,
                    instalador::instalador_permissao,
                    instalador::instalador_pedir_permissao,
                    instalador::instalador_abrir,
                    recovery::repair_database,
                    gemini::gemini_configurar_chave,
                    gemini::gemini_remover_chave,
                    gemini::gemini_tem_chave,
                    gemini::gemini_analisar_cupom,
                    dev_tools::dev_capture_window
                ]
            }
            #[cfg(not(debug_assertions))]
            {
                tauri::generate_handler![
                    cloud::cloud_signup,
                    cloud::cloud_login,
                    cloud::cloud_logout,
                    cloud::cloud_sessao,
                    cloud::cloud_entitlement,
                    cloud::cloud_backup_push,
                    cloud::cloud_backup_pull,
                    cloud::cloud_backup_auto,
                    cloud::cloud_apagar_conta,
                    imports::confirm_statement_import,
                    recovery::diagnose_database,
                    update::atualizacao_verificar,
                    update::atualizacao_dispensar,
                    update::atualizacao_baixar,
                    instalador::instalador_permissao,
                    instalador::instalador_pedir_permissao,
                    instalador::instalador_abrir,
                    recovery::repair_database,
                    gemini::gemini_configurar_chave,
                    gemini::gemini_remover_chave,
                    gemini::gemini_tem_chave,
                    gemini::gemini_analisar_cupom
                ]
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(runtime) = app_handle.try_state::<mcp::McpRuntime>() {
                    runtime.shutdown();
                }
            }
        });
}
