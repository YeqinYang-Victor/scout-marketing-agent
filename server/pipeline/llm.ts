/**
 * 大模型增强层（可选）。
 * 通过 CodeBuddy Agent SDK 让模型生成更自然、更专业的文案字段。
 * 未配置 API Key / 调用失败时自动降级为规则引擎结果，不影响主流程。
 */
import type { BrandConfig, CopyTemplate, ScoredEvent, ReportFields } from './types.js';

export interface LlmResult {
  ok: boolean;
  fields?: ReportFields;
  error?: string;
  model?: string;
}

const SYSTEM_PROMPT = [
  '你是一名券商投顾内容运营专家，擅长把金融热点事件改写成客户经理可直接转发给客户的营销文案。',
  '要求：专业、通俗、合规；不承诺收益、不使用"必涨/稳赚"等字眼；不使用夸张营销话术。',
  '只输出 JSON，不要输出任何解释性文字或 Markdown 代码块。',
].join('\n');

function buildPrompt(event: ScoredEvent, template: CopyTemplate, brand: BrandConfig): string {
  const fieldSpec = template.fields
    .map((f) => {
      if (f.type === 'list') {
        return `- ${f.key}（数组，最多 ${f.maxItems ?? 4} 项）：每项为 {"name": "名称", "code": "可选代码", "reason": "一句话理由"}。${f.prompt ?? ''}`;
      }
      return `- ${f.key}（字符串，不超过 ${f.maxChars ?? 120} 字）：${f.prompt ?? ''}`;
    })
    .join('\n');

  return `请根据以下金融热点事件，生成一份「${brand.productName}」日报所需的内容字段。

【事件信息】
标题：${event.title}
摘要：${event.summary}
详情：${(event.content ?? '').slice(0, 600)}
来源：${event.source}
涉及行业：${event.sectors.join('、') || '未标注'}
关联个股：${event.stocks.join('、') || '未标注'}
相关板块涨跌幅：${event.marketChange}%
站内热度：${event.heat}

【需要输出的字段】
${fieldSpec}

请严格输出如下 JSON 结构（不要包含多余字段）：
{"${template.fields.map((f) => f.key).join('": "...", "')}": "..."}`;
}

/** 从模型输出中提取 JSON（兼容 ```json 代码块） */
function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('模型未返回 JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateFieldsWithLLM(
  event: ScoredEvent,
  template: CopyTemplate,
  brand: BrandConfig,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<LlmResult> {
  const model = opts.model ?? process.env.SCOUT_MODEL ?? 'claude-sonnet-4';
  const timeoutMs = opts.timeoutMs ?? 90_000;

  let queryFn: any;
  try {
    const sdk = await import('@tencent-ai/agent-sdk');
    queryFn = sdk.query;
    if (typeof queryFn !== 'function') throw new Error('Agent SDK 未导出 query');
  } catch (e: any) {
    return { ok: false, error: `Agent SDK 不可用：${e?.message ?? e}` };
  }

  const run = async (): Promise<LlmResult> => {
    const stream = queryFn({
      prompt: buildPrompt(event, template, brand),
      options: {
        model,
        maxTurns: 1,
        systemPrompt: SYSTEM_PROMPT,
        permissionMode: 'bypassPermissions',
      },
    });

    let text = '';
    for await (const msg of stream) {
      if (msg?.type === 'assistant') {
        const content = msg.message?.content;
        if (typeof content === 'string') text += content;
        else if (Array.isArray(content)) {
          for (const block of content) if (block?.type === 'text') text += block.text;
        }
      }
    }
    if (!text.trim()) throw new Error('模型返回内容为空');
    return { ok: true, fields: extractJson(text) as ReportFields, model };
  };

  try {
    return await Promise.race([
      run(),
      new Promise<LlmResult>((_, reject) =>
        setTimeout(() => reject(new Error(`大模型调用超时（${timeoutMs}ms）`)), timeoutMs),
      ),
    ]);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e), model };
  }
}
