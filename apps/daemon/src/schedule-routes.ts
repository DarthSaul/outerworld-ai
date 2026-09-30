import { CreateScheduleInput, UpdateScheduleInput } from "@darthsaul/outerworld-ai-core";
import type { CrewService, Scheduler } from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

/**
 * Schedules (brief §13): list each with its next run and history, add, edit, remove (all written
 * to agent.json by CrewService; the scheduler re-arms on the `agent.updated` that follows), and
 * run now.
 */
export function scheduleRoutes(deps: { crew: CrewService; scheduler: Scheduler }): Hono {
  const app = jsonApi(new Hono());
  const { crew, scheduler } = deps;
  app.get("/agents/:id/schedules", async (c) => c.json(await scheduler.view(c.req.param("id"))));
  app.post("/agents/:id/schedules", async (c) => {
    const input = await readBody(c, CreateScheduleInput);
    return c.json(await crew.addSchedule(c.req.param("id"), input), 201);
  });
  app.patch("/agents/:id/schedules/:scheduleId", async (c) => {
    const input = await readBody(c, UpdateScheduleInput);
    return c.json(await crew.updateSchedule(c.req.param("id"), c.req.param("scheduleId"), input));
  });
  app.delete("/agents/:id/schedules/:scheduleId", async (c) => {
    await crew.removeSchedule(c.req.param("id"), c.req.param("scheduleId"));
    return c.body(null, 204);
  });
  app.post("/agents/:id/schedules/:scheduleId/run", async (c) =>
    c.json(await scheduler.runNow(c.req.param("id"), c.req.param("scheduleId")), 202),
  );
  return app;
}
