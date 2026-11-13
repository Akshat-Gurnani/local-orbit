import { acknowledgeCommand, deleteCommand } from "@/db/index";
import { NotFound, respond } from "@/lib/api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = async (_request: Request, { params }: Context) => {
  const { id } = await params;
  return respond(() => {
    if (!acknowledgeCommand(Number(id))) throw new NotFound("Command not found.");
  });
};

export const DELETE = async (_request: Request, { params }: Context) => {
  const { id } = await params;
  return respond(() => {
    if (!deleteCommand(Number(id))) throw new NotFound("Only pending commands can be cancelled.");
  });
};
