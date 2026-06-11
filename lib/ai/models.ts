export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash";

export const titleModel = {
  id: "gemini-flash-lite-latest",
  name: "Gemini Flash Lite",
  provider: "google",
  description: "Fast model for title generation",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

export const chatModels: ChatModel[] = [
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "google",
    description: "Fast flagship model with tool use and vision",
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    provider: "google",
    description: "Highest quality model for complex planning",
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash (latest)",
    provider: "google",
    description: "Stable alias for the latest fast Gemini model",
  },
];

const GEMINI_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: true,
  reasoning: false,
};

export function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return Promise.resolve(
    Object.fromEntries(chatModels.map((m) => [m.id, GEMINI_CAPABILITIES]))
  );
}

export const isDemo = process.env.IS_DEMO === "1";

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  return Promise.resolve(
    chatModels.map((m) => ({ ...m, capabilities: GEMINI_CAPABILITIES }))
  );
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
