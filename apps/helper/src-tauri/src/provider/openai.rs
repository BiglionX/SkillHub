//! OpenAI 专用扩展（M1 占位）

use super::{ChatRequest, ChatResponse, ProviderConfig, ProviderError};

pub struct OpenAiProvider;

impl OpenAiProvider {
    pub async fn chat(config: &ProviderConfig, req: &ChatRequest) -> Result<ChatResponse, ProviderError> {
        super::LlmProvider::chat(config, req).await
    }
}