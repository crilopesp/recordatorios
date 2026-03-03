import { AppController } from "./app/AppController";
import { renderAppShell } from "./app/views/AppShell";

const root = document.getElementById("appRoot");

if (!root) {
  throw new Error("Missing app root element");
}

const refs = renderAppShell(root);
const app = new AppController(refs);

app.bootstrap().catch((error) => {
  console.error("Startup error:", error);
});
