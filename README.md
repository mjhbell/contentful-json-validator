# Contentful Dynamic JSON Schema Validator

A custom Contentful App that provides a JSON Code Editor with real-time validation. Unlike standard validators, this app **dynamically fetches the validation schema** from a sibling Reference field.

This allows content editors to select a "Schema" entry (e.g., "Product Schema", "Config Schema") from a dropdown, and the JSON editor immediately enforces that specific schema's rules.

## ✨ Features

* **Dynamic Validation:** Validates JSON against a schema selected in a reference field.
* **Real-time Feedback:** Uses [AJV](https://ajv.js.org/) to provide instant error messages.
* **Pessimistic Locking:** Automatically disables the "Publish" button if the JSON is invalid or if the schema is still loading.
* **User-Friendly Errors:** Translates technical JSON paths (e.g., `/properties/price`) into readable field names (e.g., **Price** is missing).
* **Schema Centralization:** Manage your schemas as actual Contentful entries, not hardcoded strings.

---

## 🛠 Prerequisites

* Node.js (v18 or later)
* A Contentful account with Administrator access
* Contentful CLI installed (`npm install -g contentful-cli`)

---

## 🚀 Installation & Setup

### 1. Install Dependencies
Clone the repo and install the required packages:

```bash
npm install
cd {new folder}
npm run build