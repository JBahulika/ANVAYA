export type AnalyzeMode =
  | "simple"
  | "detailed"
  | "alert"
  | "read"
  | "ask"
  | "explain"
  | "simplify";

export type AnalyzeResponse = {
  text: string;
  mode: AnalyzeMode;
  confidence_note: string | null;
  disclaimer: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

export async function checkHealth(): Promise<{
  status: string;
  gemini_configured: boolean;
  model: string;
}> {
  const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Backend health check failed");
  }
  return res.json();
}

export async function analyzeImage(params: {
  image: Blob;
  filename?: string;
  mode: AnalyzeMode;
  question?: string;
}): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("image", params.image, params.filename || "capture.jpg");
  form.append("mode", params.mode);
  if (params.question?.trim()) {
    form.append("question", params.question.trim());
  }

  const res = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let detail = `Analysis failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = body.detail.map((d: { msg?: string }) => d.msg).join("; ");
      }
    } catch {
      // keep default detail
    }
    throw new Error(detail);
  }

  return res.json();
}
