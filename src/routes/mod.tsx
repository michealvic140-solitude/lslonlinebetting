import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "./admin";

export const Route = createFileRoute("/mod")({
  head: () => ({
    meta: [
      { title: "Moderator Console — ECB" },
      { name: "description", content: "Moderator tools for the E-Football Competition Bet." },
    ],
  }),
  component: AdminPage,
});
