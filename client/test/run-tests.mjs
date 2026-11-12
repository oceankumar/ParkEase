/* global console, process */
import esbuild from "esbuild";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testEntries = [
  { name: "UI Components", file: path.join(__dirname, "components.test.js") },
  { name: "API Client & Services", file: path.join(__dirname, "apiClient.test.js") },
  { name: "Auth Forms & Validation", file: path.join(__dirname, "authForms.test.js") },
  { name: "Auth Context & Protected Routes", file: path.join(__dirname, "authContext.test.js") },
  { name: "User Dashboard & Bookings", file: path.join(__dirname, "userDashboard.test.js") },
  { name: "Mall Discovery & Details", file: path.join(__dirname, "mallDiscovery.test.js") },
  { name: "Parking Availability UI", file: path.join(__dirname, "parkingAvailability.test.js") },
];

let allPassed = true;

for (const { name, file } of testEntries) {
  const tempOut = path.join(__dirname, `.temp.${path.basename(file, ".js")}.mjs`);
  console.log(`\n--- Running Tests: ${name} ---`);

  try {
    await esbuild.build({
      entryPoints: [file],
      bundle: true,
      format: "esm",
      platform: "node",
      jsx: "automatic",
      outfile: tempOut,
      external: [
        "node:test",
        "node:assert/strict",
        "react",
        "react-dom",
        "react-router-dom",
      ],
    });

    const output = execSync(`node --test "${tempOut}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.log(output);
  } catch (error) {
    allPassed = false;
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
  } finally {
    if (fs.existsSync(tempOut)) {
      fs.unlinkSync(tempOut);
    }
  }
}

if (!allPassed) {
  process.exitCode = 1;
}
