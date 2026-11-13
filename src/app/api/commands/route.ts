import { enqueueCommand, listCommands } from "@/db/index";
import { respond } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = () => respond(() => ({ commands: listCommands(100) }));

const NewCommand = z.object({
  target_agent: z.string().trim().min(1, "Choose a target agent."),
  instruction: z.string().trim().min(1, "Write an instruction."),
  project_id: z.string().nullable().optional(),
});

export const POST = (request: Request) => respond(async () => enqueueCommand(NewCommand.parse(await request.json())), 201);
