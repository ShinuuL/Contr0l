//! Ferramentas de desenvolvimento — compiladas SOMENTE em debug.
//!
//! Este módulo NÃO deve ser registrado em release. O gate é feito em `lib.rs`
//! com `#[cfg(debug_assertions)]` no `mod`, no `use` e no `invoke_handler`.

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
pub struct CaptureOutcome {
    pub path: String,
    pub width: u32,
    pub height: u32,
}

/// Captura um screenshot da janela principal do app (somente debug).
///
/// Salva um PNG no caminho informado. Se `path` for relativo, é resolvido a
/// partir do diretório atual do processo. Usado para validação visual durante
/// desenvolvimento; não registrado em builds release.
#[tauri::command]
pub fn dev_capture_window(app: tauri::AppHandle, path: String) -> Result<CaptureOutcome, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada.".to_string())?;

    let pos = window
        .outer_position()
        .map_err(|e| format!("Não foi possível obter posição da janela: {e}"))?;
    let size = window
        .outer_size()
        .map_err(|e| format!("Não foi possível obter tamanho da janela: {e}"))?;

    let x = pos.x;
    let y = pos.y;
    let width = size.width;
    let height = size.height;

    if width == 0 || height == 0 {
        return Err("Janela com tamanho inválido para captura.".to_string());
    }

    let out_path = std::path::PathBuf::from(&path);
    if let Some(parent) = out_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Não foi possível criar diretório de saída: {e}"))?;
        }
    }

    // Caminho absoluto evita surpresas com cwd do processo.
    let abs_path = if out_path.is_absolute() {
        out_path
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Não foi possível obter diretório atual: {e}"))?
            .join(out_path)
    };
    let abs_str = abs_path.to_string_lossy().replace('\'', "''");

    // Captura via .NET/PowerShell (Windows) — sem dependência Rust nova.
    // CopyFromScreen captura a região da tela onde a janela está.
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap({width}, {height})
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen({x}, {y}, 0, 0, $bmp.Size)
$bmp.Save('{abs_str}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
"#
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("Falha ao executar PowerShell para captura: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Captura falhou (status {}): {} {}",
            output.status,
            stderr.trim(),
            stdout.trim()
        )
        .trim()
        .to_string());
    }

    if !abs_path.exists() {
        return Err(format!(
            "Captura concluiu sem erro, mas o arquivo não foi criado: {}",
            abs_path.display()
        ));
    }

    Ok(CaptureOutcome {
        path: abs_path.to_string_lossy().to_string(),
        width,
        height,
    })
}
