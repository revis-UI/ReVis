import type {
  AIIntentAnalysis,
  AIIntentKind,
  AIIntentTarget,
  AIRequestPhase,
} from "./ai";

const EDITING_STEPS: AIRequestPhase[] = [
  "analyzing",
  "connecting",
  "generating",
  "validating",
  "saving",
];

const VISUAL_PATTERN =
  /\b(?:align|axis|center|centre|color|colour|font|layout|legend|margin|palette|position|size|spacing|style|theme|blue|red|green|yellow|purple)\b|(?:颜色|配色|字体|布局|图例|边距|位置|大小|间距|样式|主题|坐标轴|对齐|居中|蓝色|红色|绿色|黄色|紫色)/iu;

const CONTENT_PATTERN =
  /\b(?:caption|copy|description|label|name|rename|text|title|tooltip)\b|(?:标题|标签|文案|描述|名称|重命名|文本|提示)/iu;

const STRUCTURE_PATTERN =
  /\b(?:add|container|coordinate|create|delete|mark|remove|series|structure|type)\b|(?:新增|添加|删除|移除|容器|坐标系|标记|图表类型|结构)/iu;

const DATA_PATTERN =
  /\b(?:data|dataset|encoding|field|measure|metric|series|value|view\s*data)\b|(?:数据|数据集|字段|度量|指标|系列|数值|编码)/iu;

const VAGUE_PATTERN =
  /^(?:improve|optimize|refine|make it better|update it|调整一下|优化一下|改一下|帮我优化|帮我改一下)[!.。！\s]*$/iu;

function includes(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function target(area: AIIntentTarget["area"], description: string): AIIntentTarget {
  return { area, description };
}

function titleFor(kind: AIIntentKind): string {
  switch (kind) {
    case "visual":
      return "Visual refinement";
    case "content":
      return "Content update";
    case "structure":
      return "Structure change";
    case "data":
      return "Data adjustment";
    case "mixed":
      return "Combined chart update";
    case "clarification":
      return "Clarification needed";
  }
}

/**
 * Produces a small, deterministic intent plan before any model request is
 * sent. It never reads the DSL, calls a remote service, or authorizes a change.
 */
export function analyzeAIIntent(instruction: string): AIIntentAnalysis {
  const normalized = instruction.replace(/\s+/gu, " ").trim();
  const visual = includes(VISUAL_PATTERN, normalized);
  const content = includes(CONTENT_PATTERN, normalized);
  const structure = includes(STRUCTURE_PATTERN, normalized);
  const data = includes(DATA_PATTERN, normalized);
  // This preflight should guide a request, not become a brittle gatekeeper.
  // Only clearly underspecified instructions are held back; all other input
  // can still be validated safely by the patch pipeline.
  const needsClarification =
    normalized.length < 3 || includes(VAGUE_PATTERN, normalized);

  if (needsClarification) {
    return {
      kind: "clarification",
      title: titleFor("clarification"),
      overview:
        "This editor can apply a concrete change to the DSL or view data, but the requested outcome is not specific enough yet.",
      targets: [],
      steps: ["analyzing"],
      needsClarification: true,
      clarification:
        "Name the chart element and the desired outcome, for example: “Make the title blue” or “Move the legend below the chart.”",
    };
  }

  const primarySignalCount = [visual, structure, data].filter(Boolean).length;
  const kind: AIIntentKind =
    primarySignalCount > 1
      ? "mixed"
      : visual
        ? "visual"
        : structure
          ? "structure"
          : data
            ? "data"
            : content
              ? "content"
              : "mixed";
  const targets: AIIntentTarget[] = [];
  if (visual || content || structure || !data) {
    targets.push(target("dsl", "DSL structure and presentation"));
  }
  if (data || (visual && structure)) {
    targets.push(target("viewData", "View data and visual encodings"));
  }

  return {
    kind,
    title: titleFor(kind),
    overview:
      "I’ll prepare the smallest safe change, validate the complete document, and save it only after validation succeeds.",
    targets,
    steps: EDITING_STEPS,
    needsClarification: false,
  };
}
