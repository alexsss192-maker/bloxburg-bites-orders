import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SKIPPE_MODES,
  SKIPPE_MODEL_LABELS,
} from "@/lib/skippe-models";

export type { SkippeMode } from "@/lib/skippe-models";

export {
  SKIPPE_MODES,
  SKIPPE_MODEL_LABELS,
  SKIPPE_MODE_OPTIONS,
  modelShowsThinking,
} from "@/lib/skippe-models";

import type { SkippeToolRun } from "@/lib/skippe.server";

export type SkippeSavedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_count: number;
  model: string | null;
  created_at: string;
};

export type SkippeReply = {
  reply: string;
  thinking: string;
  runs: SkippeToolRun[];
  model: string;
  model_label: string;
  auto: boolean;
};

const pandaInput = z.object({
  message: z.string().trim().max(2000),

  images: z
    .array(
      z.object({
        data_url: z.string().max(6_500_000),
      }),
    )
    .max(9)
    .default([]),

  mode: z
    .enum(SKIPPE_MODES)
    .default("lite_25"),

  /** Client-side chat history (localStorage). No DB read. */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

export const pandaChat = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    pandaInput.parse(d),
  )
  .handler(async ({ context, data }): Promise<SkippeReply> => {
    /*
     * IMPORTANT:
     * Keep Skippe's server-only implementation out of the
     * module-level import graph.
     *
     * staff.panda.tsx is part of the generated route tree,
     * so importing skippe.server.ts at the top of this file
     * can affect SSR for unrelated public routes.
     */
    const {
      buildSkippePrompt,
      resolveModel,
      runSkippeTurn,
    } = await import("@/lib/skippe.server");

    const { data: roleRows } =
      await context.supabase
        .from("user_roles" as never)
        .select("role")
        .eq("user_id", context.userId);

    const roles =
      (
        (roleRows as unknown as Array<{
          role: string;
        }> | null) ?? []
      ).map((r) => r.role);

    const isAdmin = roles.includes("admin");

    if (
      !roles.includes("chef") &&
      !isAdmin
    ) {
      throw new Error(
        "Chef or admin only",
      );
    }

    const actorEmail =
      (
        context.claims as
          | { email?: string }
          | undefined
      )?.email ?? null;

    const { data: profile } =
      await context.supabase
        .from("staff_profiles" as never)
        .select("username")
        .eq(
          "user_id",
          context.userId,
        )
        .maybeSingle();

    const staffName =
      (
        profile as unknown as
          | {
              username?: string;
            }
          | null
      )?.username ??
      actorEmail?.split("@")[0] ??
      "Chef";

    // History comes from the browser (localStorage) — no skippe_messages read.
    const history = (data.history ?? []).slice(-16);

    const {
      model,
      auto,
    } = resolveModel(
      data.mode,
      data.images.length,
      data.message,
    );

    const turn =
      await runSkippeTurn({
        model,

        instructions:
          buildSkippePrompt({
            staffName,
            isAdmin,
          }),

        history,

        userText: data.message,

        images: data.images,

        staffName,

        ctx: {
          supabase:
            context.supabase as never,

          userId:
            context.userId,

          isAdmin,

          actorEmail,
        },
      });

    const reply =
      turn.reply ||
      (
        turn.runs.length > 0
          ? turn.runs
              .map(
                (r) =>
                  `${
                    r.ok
                      ? "✅"
                      : "⚠️"
                  } ${r.summary}`,
              )
              .join("\n")
          : "I couldn't put a reply together — try asking again?"
      );

        return {
      reply,

      thinking:
        turn.thinking,

      runs:
        turn.runs,

      model,

      model_label:
        SKIPPE_MODEL_LABELS[model] ??
        model,

      auto,
    };
  });

export const listSkippeChat =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(async ({ context }) => {
      const {
        data,
        error,
      } = await context.supabase
        .from(
          "skippe_messages" as never,
        )
        .select(
          "id, role, content, image_count, model, created_at",
        )
        .eq(
          "owner_id",
          context.userId,
        )
        .order("created_at", {
          ascending: true,
        })
        .limit(200);

      if (error) {
        throw new Error(
          error.message,
        );
      }

      return (
        data ?? []
      ) as unknown as SkippeSavedMessage[];
    });

export const clearSkippeChat =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(async ({ context }) => {
      const {
        error,
      } = await context.supabase
        .from(
          "skippe_messages" as never,
        )
        .delete()
        .eq(
          "owner_id",
          context.userId,
        );

      if (error) {
        throw new Error(
          error.message,
        );
      }

      return {
        ok: true,
      };
    });

export const listPandaAudit =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator((d: unknown) =>
      z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .default(50),

          action: z
            .string()
            .max(64)
            .optional()
            .nullable(),

          actor: z
            .string()
            .max(64)
            .optional()
            .nullable(),
        })
        .parse(d ?? {}),
    )
    .handler(async ({ context, data }) => {
      const {
        data: roleRows,
      } = await context.supabase
        .from("user_roles" as never)
        .select("role")
        .eq(
          "user_id",
          context.userId,
        );

      const roles =
        (
          (roleRows as unknown as Array<{
            role: string;
          }> | null) ?? []
        ).map(
          (r) => r.role,
        );

      if (
        !roles.includes("admin")
      ) {
        throw new Error(
          "Admins only",
        );
      }


      let q =
        context.supabase
          .from(
            "panda_audit_log" as never,
          )
          .select(
            "id, actor_user_id, actor_email, action, target_type, target_id, payload, created_at",
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(data.limit);

      if (data.action) {
        q = q.ilike(
          "action",
          `%${data.action}%`,
        );
      }

      if (data.actor) {
        q = q.ilike(
          "actor_email",
          `%${data.actor}%`,
        );
      }

      const {
        data: rows,
        error,
      } = await q;

      if (error) {
        throw new Error(
          error.message,
        );
      }

      const raw =
        (
          rows ?? []
        ) as unknown as Array<{
          id: string;
          actor_user_id:
            | string
            | null;
          actor_email:
            | string
            | null;
          action: string;
          target_type:
            | string
            | null;
          target_id:
            | string
            | null;
          payload: unknown;
          created_at: string;
        }>;

      return {
        entries: raw.map(
          (r) => ({
            id: r.id,

            actor_user_id:
              r.actor_user_id,

            actor_email:
              r.actor_email,

            action:
              r.action,

            target_type:
              r.target_type,

            target_id:
              r.target_id,

            payload_json:
              JSON.stringify(
                r.payload ?? {},
              ),

            created_at:
              r.created_at,
          }),
        ),
      };
    });
