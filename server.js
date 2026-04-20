const http = require("http");
const fs = require("fs");
const path = require("path");
const { URLSearchParams } = require("url");

const PORT = 3000;
const CSV_PATH = path.join(__dirname, "data", "ticket_orders.csv");

// CSV column headers — card number is intentionally excluded for security
const CSV_HEADERS = [
  "Order ID",
  "Timestamp",
  "Email",
  "First Name",
  "Last Name",
  "Address",
  "City",
  "State",
  "ZIP",
  "Phone",
  "Order Type",
  "Ticket Quantity",
  "Payment Method",
  "Card Type",
  "Exp Month",
  "Exp Year",
];

// Wrap a value in quotes and escape any quotes inside it
function csvCell(value) {
  const str = (value ?? "").toString().trim();
  return `"${str.replace(/"/g, '""')}"`;
}

// Build one CSV row from a parsed form body
function buildRow(orderId, body) {
  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  const cells = [
    orderId,
    timestamp,
    body.get("email") ?? "",
    body.get("first-name") ?? "",
    body.get("last-name") ?? "",
    body.get("address") ?? "",
    body.get("city") ?? "",
    body.get("state") ?? "",
    body.get("zip") ?? "",
    body.get("phone") ?? "",
    body.get("order-type") ?? "",
    body.get("ticket-quantity") ?? "",
    body.get("payment") === "credit" ? "Credit Card" : "Bill Me",
    body.get("payment") === "credit" ? (body.get("card_type") ?? "") : "",
    body.get("payment") === "credit" ? (body.get("exp_month") ?? "") : "",
    body.get("payment") === "credit" ? (body.get("exp_year") ?? "") : "",
  ];

  return cells.map(csvCell).join(",");
}

// Generate a simple sequential order ID (e.g. ORD-0001)
function nextOrderId() {
  try {
    const content = fs.readFileSync(CSV_PATH, "utf8");
    const dataLines = content.split("\n").filter((l) => l.trim() && !l.startsWith('"Order ID"'));
    return `ORD-${String(dataLines.length + 1).padStart(4, "0")}`;
  } catch {
    return "ORD-0001";
  }
}

// Ensure the data directory and CSV file (with headers) exist
function ensureCsv() {
  const dir = path.dirname(CSV_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, CSV_HEADERS.map(csvCell).join(",") + "\n", "utf8");
  }
}

// Serve static files from the project root
function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".swf": "application/x-shockwave-flash",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
}

const server = http.createServer((req, res) => {
  // Handle form submission
  if (req.method === "POST" && req.url === "/submit-order") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const params = new URLSearchParams(body);
        ensureCsv();
        const orderId = nextOrderId();
        const row = buildRow(orderId, params);
        fs.appendFileSync(CSV_PATH, row + "\n", "utf8");

        // Redirect to confirmation page, passing the order ID in the query string
        res.writeHead(302, {
          Location: `/register_account.html?order=${encodeURIComponent(orderId)}&name=${encodeURIComponent(params.get("first-name") ?? "")}`,
        });
        res.end();
      } catch (err) {
        console.error("Error saving order:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server error — order could not be saved.");
      }
    });
    return;
  }

  // Resolve URL to a file path
  let urlPath = req.url.split("?")[0]; // strip query string
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(__dirname, urlPath);

  // Basic path traversal protection
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  serveStatic(res, filePath);
});

ensureCsv();
server.listen(PORT, () => {
  console.log(`Town Hall server running at http://localhost:${PORT}`);
  console.log(`Ticket orders will be saved to: ${CSV_PATH}`);
});
