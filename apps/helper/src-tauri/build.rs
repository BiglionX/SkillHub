fn main() {
    // `tauri::generate_context!()` 在编译期要求 frontendDist 路径存在。
    // 干净 checkout 或仅运行 `cargo test` 时前端产物尚未构建，这里创建最小占位，
    // 使 Rust 编译/测试不依赖前端构建顺序。
    // 真实 `tauri build` 时 beforeBuildCommand 会先执行 `pnpm vite build` 生成完整产物，
    // 此处检测到目录已存在则不做任何改动。
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let dist = manifest_dir.join("..").join("dist");
    if !dist.is_dir() {
        if let Err(e) = std::fs::create_dir_all(&dist) {
            eprintln!("warning: 无法创建前端产物目录 {:?}: {}", dist, e);
        }
    }
    let index = dist.join("index.html");
    if !index.exists() {
        if let Err(e) = std::fs::write(
            &index,
            "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\"></head><body></body></html>",
        ) {
            eprintln!("warning: 无法创建前端占位文件 {:?}: {}", index, e);
        }
    }

    tauri_build::build();
}
