import { z } from "zod";

const playerSchema = z.object({
  id: z.string().min(1, "Player id is required."),
  name: z.string().trim().min(1, "Player name is required."),
});

export const generateScheduleSchema = z
  .object({
    matchType: z.enum(["singles", "doubles"]),
    courtCount: z.coerce.number().int().min(1, "At least one court is required."),
    roundCount: z.coerce.number().int().min(1, "At least one round is required."),
    players: z.array(playerSchema).min(2, "At least two players are required."),
  })
  .superRefine((value, ctx) => {
    const trimmedNames = value.players.map((player) => player.name.trim());
    const uniqueNames = new Set(trimmedNames.map((name) => name.toLowerCase()));

    if (trimmedNames.some((name) => name.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["players"],
        message: "Player names cannot be empty.",
      });
    }

    if (uniqueNames.size !== trimmedNames.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["players"],
        message: "Player names must be unique.",
      });
    }

    if (value.matchType === "doubles") {
      if (value.players.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["players"],
          message: "Doubles requires at least four players.",
        });
      }
    }
  });

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
