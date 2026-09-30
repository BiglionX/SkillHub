// SkillHub Helper 入口
// v2.0.2 D6 决策：默认走「用户本地 Key + 助手转发」
// v2.0.7+：release 编译走 windows subsystem（隐藏 console 黑窗口）；
// debug 仍保留 console subsystem 方便看 env_logger 输出。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use skillhub_helper_lib::run;

fn main() {
    run();
}