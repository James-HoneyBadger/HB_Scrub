#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

type BoxError = Box<dyn std::error::Error>;
const DEFAULT_PORT: u16 = 3777;
const MAX_PORT_OFFSET: u16 = 20;

struct ManagedServer {
    child: Mutex<Option<Child>>,
}

fn port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn server_reachable(port: u16) -> bool {
    TcpStream::connect_timeout(
        &(std::net::Ipv4Addr::LOCALHOST, port).into(),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn pick_port(preferred: u16) -> u16 {
    if server_reachable(preferred) {
        return preferred;
    }

    if port_available(preferred) {
        return preferred;
    }

    for offset in 1..=MAX_PORT_OFFSET {
        let candidate = preferred.saturating_add(offset);
        if port_available(candidate) {
            return candidate;
        }
    }

    preferred
}

fn wait_for_server(port: u16, timeout: Duration) -> Result<(), BoxError> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if server_reachable(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }

    Err(format!("HB Scrub service did not start on port {}", port).into())
}

fn resolve_server_script(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(cwd) = env::current_dir() {
        candidates.push(cwd.join("dist").join("hb-scrub.gui.js"));
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("dist").join("hb-scrub.gui.js"));
            candidates.push(dir.join("..").join("dist").join("hb-scrub.gui.js"));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("dist").join("hb-scrub.gui.js"));
        candidates.push(resource_dir.join("hb-scrub.gui.js"));
    }

    candidates.into_iter().find(|path| path.exists())
}

fn spawn_server(app: &AppHandle, port: u16) -> Result<Child, BoxError> {
    let node_bin = env::var("HB_SCRUB_NODE").unwrap_or_else(|_| String::from("node"));
    let server_script = resolve_server_script(app)
        .ok_or_else(|| String::from("Unable to locate dist/hb-scrub.gui.js for the Tauri shell"))?;

    let child = Command::new(node_bin)
        .arg(server_script)
        .env("HB_SCRUB_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    Ok(child)
}

fn cleanup_server(app: &AppHandle) {
    if let Some(state) = app.try_state::<ManagedServer>() {
        if let Ok(mut child) = state.child.lock() {
            if let Some(process) = child.as_mut() {
                let _ = process.kill();
            }
            *child = None;
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let preferred_port = env::var("HB_SCRUB_PORT")
                .ok()
                .and_then(|value| value.parse::<u16>().ok())
                .unwrap_or(DEFAULT_PORT);

            let server_port = pick_port(preferred_port);
            let child = if server_reachable(server_port) {
                None
            } else {
                Some(spawn_server(&app.handle(), server_port)?)
            };

            app.manage(ManagedServer {
                child: Mutex::new(child),
            });

            wait_for_server(server_port, Duration::from_secs(12))?;

            let url = format!("http://127.0.0.1:{}/", server_port)
                .parse()
                .map_err(|err| format!("Invalid desktop URL: {err}"))?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("HB Scrub")
                .inner_size(1100.0, 820.0)
                .min_inner_size(760.0, 560.0)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Tauri desktop shell");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
            cleanup_server(app_handle);
        }
    });
}
