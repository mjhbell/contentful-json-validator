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

```

### 2. Build Custom App Bundle
Clone the repo and install the required packages:

```bash
cd {new folder}
npm run build
```

---

## ⚙️ Contentful Configuration

This app relies on a **"Sibling Field"** architecture. You must follow these steps exactly to ensure the App can find the schema and validate your data.

### Step 1: Create the "Schema" Content Type
First, you need a Content Type to store your reusable JSON validation schemas.

1.  **Create Content Type:**
    * **Name:** `JSON Schema`
    * **API Identifier:** `jsonSchema`
2.  **Add Field 1 (Title):**
    * **Type:** Text (Short)
    * **Name:** `Name` (e.g., "Product Schema")
3.  **Add Field 2 (The Rules):**
    * **Type:** JSON Object
    * **Name:** `Schema`
    * **API Identifier:** `schema` *(Crucial: The code looks for this specific ID)*

### Step 2: Create the App Definition
You need to register your code as an App within Contentful so it can be assigned to fields.

1.  **Create the App:**
    * Go to **Organization Settings > Apps**.
    * Click **Create app**.
    * Give it a name (e.g., "Dynamic JSON Validator").

2.  **Configure Frontend:**
    * Under **App URL**, enter your hosting URL:
        * *For development:* `http://localhost:3000`
        * *For production:* Your hosted URL (e.g., Netlify/Vercel link).

3.  **Set Locations:**
    * Scroll to **App Locations**.
    * Check **Entry field**.
    * In the dropdown, select **JSON Object**. This ensures the app only appears for JSON fields.

4.  **Define Instance Parameters:**
    * Scroll to **Instance Parameters**.
    * Click **Create parameter** to define the configuration variable:
        * **ID:** `schemaRefFieldId`
        * **Name:** Schema Reference Field ID
        * **Type:** Short text
        * **Default Value:** `schemaDefinition`
    * This allows you to tell the app which sibling field to watch.

5.  **Grant Permissions (Crucial):**
    * Scroll up to the **Security** tab (or "App Permissions" section).
    * Enable **Content Management API**.
    * select **"Read content"** (This allows the app to fetch the schema from the linked entry).
    * Click **Save**.

### Step 3: Set up your Page/Product Content Type
Now, configure the Content Type where you actually want to use the validator (e.g., "Product" or "Landing Page").

1.  **Add the Reference Field (The Sibling):**
    * **Type:** Reference (One reference)
    * **Name:** Schema Definition
    * **API Identifier:** `schemaDefinition`
    * **Validation:** Limit this field to accept only entries of type **JSON Schema**.
2.  **Add the Data Field (The Editor):**
    * **Type:** JSON Object
    * **Name:** Data (or Config/Properties)
    * **API Identifier:** `data` (or any name you prefer)
3.  **Connect the App:**
    * Go to the **Appearance** tab of your new JSON Object field.
    * Select your **Custom JSON Validator App**.
    * In the parameter field that appears, enter: `schemaDefinition` (This tells the app to look at the reference field you created in Step 3.1).