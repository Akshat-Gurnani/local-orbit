import { listProjects } from "@/db/index";
import { respond } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = () => respond(() => ({ projects: listProjects() }));
