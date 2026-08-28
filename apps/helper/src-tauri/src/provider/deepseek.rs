//! DeepSeek 专用扩展（M1 占位，深度的 Provider 特定逻辑后续补）

use super::{ChatRequest, ChatResponse, ProviderConfig, ProviderError};

pub struct DeepSeekProvider;

impl DeepSeekProvider {
    /// DeepSeek 特有的 prompt cache 提示（system prompt 部分命中后价格更低）
    pub fn should_use_prompt_cache(_messages: &[super::ChatMessage]) -> bool {
        // M1 简化：只要有 system message 就启用 cache
        true
    }

    pub async fn chat(config: &ProviderConfig, req: &ChatRequest) -> Result<ChatResponse, ProviderError> {
        super::LlmProvider::chat(config, req).await
    }
}