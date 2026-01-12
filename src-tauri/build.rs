fn main() {
    tauri_build::build();
    
    // On Windows cross-compilation, ensure WebView2Loader.dll is copied to release directory
    // This is handled automatically by Tauri's bundler, but we ensure it's available
    // for standalone .exe distribution
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use std::fs;
        use std::path::PathBuf;
        
        let target = env::var("TARGET").unwrap();
        if target.contains("windows") {
            let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
            let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
            
            // Navigate from OUT_DIR to target directory
            // OUT_DIR is typically: target/{target}/build/{package}/out
            // We need: target/{target}/{profile}/
            let mut target_dir = out_dir.clone();
            for _ in 0..4 {
                if !target_dir.pop() {
                    return;
                }
            }
            target_dir.push(&profile);
            
            // Find WebView2Loader.dll in build directory
            // It's typically in: target/{target}/build/webview2-com-sys-{hash}/out/{arch}/WebView2Loader.dll
            let build_dir = out_dir.parent().unwrap().parent().unwrap();
            let arch = if target.contains("x86_64") {
                "x64"
            } else if target.contains("i686") {
                "x86"
            } else if target.contains("aarch64") {
                "arm64"
            } else {
                return; // Unknown architecture
            };
            
            // Search for webview2-com-sys build directory
            if let Ok(entries) = fs::read_dir(build_dir) {
                for entry in entries.flatten() {
                    let dir_name = entry.file_name();
                    if dir_name.to_string_lossy().starts_with("webview2-com-sys") {
                        let dll_path = entry.path().join("out").join(arch).join("WebView2Loader.dll");
                        if dll_path.exists() {
                            let dest_path = target_dir.join("WebView2Loader.dll");
                            if let Err(e) = fs::copy(&dll_path, &dest_path) {
                                println!("cargo:warning=Failed to copy WebView2Loader.dll: {}", e);
                            } else {
                                println!("cargo:warning=Copied WebView2Loader.dll to {}", dest_path.display());
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
}
