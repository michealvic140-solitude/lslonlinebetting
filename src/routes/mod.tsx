import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "./admin";

export const Route = createFileRoute("/mod")({
  head: () => ({
    meta: [
      { title: "Moderator Console — LSL" },
      { name: "description", content: "Moderator tools for the Lomita Shooters League." },
    ],
  }),
  component: AdminPage,
});
