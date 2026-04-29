import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import { LLAMA_MODEL } from "./constants";

interface TranscriptSegmentRow {
  id: string;
  room_id: string;
  participant_id: string;
  source_text: string;
  source_language: string;
  started_at: number;
  duration_ms: number;
}

export class PostCallSummaryWorkflow extends WorkflowEntrypoint<
  Env,
  { roomId: string }
> {
  async run(
    event: WorkflowEvent<{ roomId: string }>,
    step: WorkflowStep,
  ): Promise<{ roomId: string; summary: string; segmentCount: number }> {
    const { roomId } = event.payload;

    const segments = await step.do("fetch-segments", async () => {
      const result = await this.env.DB.prepare(
        "SELECT * FROM transcript_segments WHERE room_id = ? ORDER BY started_at ASC",
      )
        .bind(roomId)
        .all<TranscriptSegmentRow>();
      return result.results ?? [];
    });

    const summary = await step.do("generate-summary", async () => {
      const fullTranscript = segments
        .map(
          (s) => `[${s.source_language}] ${s.source_text}`,
        )
        .join("\n");

      const result = (await this.env.AI.run(LLAMA_MODEL, {
        prompt: `Summarize this multilingual conference call transcript in English.
Include: main topics, decisions made, action items.
Format your answer in Markdown (use **bold** for section labels, lists where helpful).
Transcript:\n${fullTranscript}`,
        max_tokens: 800,
      })) as { response?: string };
      return (result.response ?? "") as string;
    });

    await step.do("store-summary", async () => {
      const key = `rooms/${roomId}/summary.json`;
      await this.env.TRANSCRIPTS.put(
        key,
        JSON.stringify({
          roomId,
          summary,
          segmentCount: segments.length,
          generatedAt: Date.now(),
        }),
        {
          httpMetadata: { contentType: "application/json" },
        },
      );
    });

    return { roomId, summary, segmentCount: segments.length };
  }
}
