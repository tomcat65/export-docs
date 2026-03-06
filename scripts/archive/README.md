# Archived Production Remediation Scripts

These scripts were one-off remediation tools used during production incidents.
They are archived here for incident documentation purposes. **Do not run these
scripts unless you fully understand their impact — they perform destructive
database operations (deleting documents and GridFS files).**

Original locations: project root directory.

## Scripts

### test-fix-mcop650126304.js

**Purpose:** Fix misattributed BOL document MCOP0101_650126304.pdf.

The document was incorrectly associated with BOL number `HLCUSHA2307ADRIA`
instead of `650126304`. This script finds all documents and GridFS files
referencing either the incorrect BOL number or the filename, deletes them
from both the documents collection and GridFS, then verifies cleanup.

**Incident:** BOL number extraction assigned the wrong identifier to an
uploaded PDF, causing it to appear under the wrong shipment.

---

### test-cleanup-bol.js

**Purpose:** Diagnose and clean up all traces of BOL number `650126304`.

Connects directly to MongoDB (not Mongoose models), finds BOL documents and
their related documents (COO, PL, etc.), deletes associated GridFS files
(both file metadata and chunks), then deletes the document records. Includes
a verification step to confirm complete removal.

**Incident:** Needed to fully purge a BOL and all related documents/files
so the document could be re-uploaded cleanly.

---

### test-cleanup-specific-bol.js

**Purpose:** Clean up BOL number `650126304` using Mongoose connection.

Similar to `test-cleanup-bol.js` but uses Mongoose (not raw MongoClient) and
searches via `customFields.bolNumber`. Finds related documents via
`relatedDocuments.bolId`, deletes GridFS files via `fs.files` collection,
then removes all document records.

**Incident:** Same BOL re-upload issue, different approach to cleanup.

---

### test-cleanup-hlcusha2307adria.js

**Purpose:** Clean up all traces of BOL number `HLCUSHA2307ADRIA`.

Deep search across multiple field paths (`customFields.bolNumber`,
`bolNumber`, `document.bolNumber`, `document.shipmentDetails.bolNumber`)
plus a `$where` JSON substring search as fallback. Deletes related GridFS
files by both `metadata.documentId` and `metadata.bolNumber`/filename match.

**Incident:** Companion to the MCOP fix — this removed the ghost BOL record
created by the misattribution.

---

### test-bol-diagnostics.js

**Purpose:** End-to-end diagnostic for BOL document processing.

Reads a local PDF file, sends it to the Firebase `processBolDocument` Cloud
Function for extraction, then checks MongoDB for duplicate BOL numbers.
Saves extracted data to `processed-data.json` for manual review.

**Incident:** Used to diagnose why BOL number extraction was producing
incorrect results for specific documents.

---

### test-firebase.js / test-firebase.cjs

**Purpose:** Manual Firebase connection and function invocation tests.
Used to verify Firebase Functions deployment and connectivity during setup.

---

### test-firebase-function.js / test-firebase-function.cjs

**Purpose:** Direct test of the `processBolDocument` Firebase Cloud Function.
Used to test BOL processing outside of the Next.js app during debugging.

---

### test-claude-integration.js

**Purpose:** Direct Anthropic API integration test.
Used to verify Claude vision API access and BOL extraction prompts in isolation.

---

### test-firebase.js / test-firebase.cjs
**Purpose:** Manual Firebase connection and function invocation tests during setup.

### test-firebase-function.js / test-firebase-function.cjs
**Purpose:** Direct test of the processBolDocument Firebase Cloud Function during debugging.

### test-claude-integration.js
**Purpose:** Direct Anthropic API integration test to verify Claude vision access and BOL extraction prompts.
