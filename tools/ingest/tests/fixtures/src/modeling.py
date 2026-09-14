import torch
from torch import nn


class MiniHybridModel(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.embed = nn.Embedding(config.vocab_size, config.hidden_size)
        self.attn = KimiDeltaAttention(config)
        self.norm = RMSNorm(config.hidden_size)
        self.moe = MoE(config)
        self.head = nn.Linear(config.hidden_size, config.vocab_size, bias=False)

    def forward(self, tokens):
        hidden = self.embed(tokens)
        hidden = self.attn(hidden)
        hidden = self.moe(self.norm(hidden))
        return self.head(hidden)
