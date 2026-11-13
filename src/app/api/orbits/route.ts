import { createOrbit, listOrbits, PLATFORMS } from "@/db/index";
import { respond } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = () => respond(() => ({ orbits: listOrbits() }));

const NewOrbit = z.object({
  name: z.string().trim().min(1, "Name your Orbit."),
  project_id: z.string(),
  goal_prompt: z.string().trim().min(1, "Describe the goal."),
  target_platform: z.enum(PLATFORMS),
  schedule_cron: z.string().nullable().optional(),
});

export const POST = (request: Request) => respond(async () => createOrbit(NewOrbit.parse(await request.json())), 201);
