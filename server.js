const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = "v1";
const BASE = `/api/${API_VERSION}`;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// GRADING DATA  (Nigerian 5.0 Scale)
// ─────────────────────────────────────────────────────────────────────────────
const GRADE_POINTS = { A: 5.0, B: 4.0, C: 3.0, D: 2.0, F: 0.0 };

const SCORE_BANDS = [
  { grade: "A", points: 5.0, min: 70,  max: 100, label: "Distinction"   },
  { grade: "B", points: 4.0, min: 60,  max: 69,  label: "Upper Credit"  },
  { grade: "C", points: 3.0, min: 50,  max: 59,  label: "Lower Credit"  },
  { grade: "D", points: 2.0, min: 40,  max: 49,  label: "Pass"          },
  { grade: "F", points: 0.0, min: 0,   max: 39,  label: "Fail"          },
];

const DEGREE_CLASSES = [
  { class: "First Class Honours",  min: 4.50, max: 5.00 },
  { class: "Second Class Upper",   min: 3.50, max: 4.49 },
  { class: "Second Class Lower",   min: 2.40, max: 3.49 },
  { class: "Third Class",          min: 1.50, max: 2.39 },
  { class: "Pass",                 min: 1.00, max: 1.49 },
  { class: "Fail",                 min: 0.00, max: 0.99 },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function scoreToGrade(score) {
  const band = SCORE_BANDS.find(b => score >= b.min && score <= b.max);
  return band || null;
}

function gpaToClass(gpa) {
  return DEGREE_CLASSES.find(d => gpa >= d.min && gpa <= d.max) || DEGREE_CLASSES[DEGREE_CLASSES.length - 1];
}

function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, ...data });
}

function fail(res, message, statusCode = 400, details = null) {
  const body = { success: false, error: message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

function validateCourse(course, index) {
  const errors = [];
  if (!course.code || typeof course.code !== "string") errors.push(`courses[${index}].code is required`);
  if (!course.credits || isNaN(parseInt(course.credits)) || parseInt(course.credits) < 1) errors.push(`courses[${index}].credits must be a positive integer`);
  if (course.score !== undefined && course.score !== null) {
    const s = parseFloat(course.score);
    if (isNaN(s) || s < 0 || s > 100) errors.push(`courses[${index}].score must be 0–100`);
  } else if (course.grade !== undefined) {
    if (!(course.grade.toUpperCase() in GRADE_POINTS)) errors.push(`courses[${index}].grade must be one of: ${Object.keys(GRADE_POINTS).join(", ")}`);
  } else {
    errors.push(`courses[${index}] must include either a score (0–100) or a grade (${Object.keys(GRADE_POINTS).join("/")})`);
  }
  return errors;
}

function processCourse(course) {
  let grade, band;
  if (course.score !== undefined && course.score !== null) {
    const s = parseFloat(course.score);
    band = scoreToGrade(s);
    grade = band.grade;
  } else {
    grade = course.grade.toUpperCase();
    band = SCORE_BANDS.find(b => b.grade === grade);
  }
  const credits = parseInt(course.credits);
  const gradePoint = GRADE_POINTS[grade];
  const qualityPoints = parseFloat((gradePoint * credits).toFixed(2));
  return {
    title: course.title?.trim() || null,
    code: course.code.trim().toUpperCase(),
    credits,
    score: course.score !== undefined ? parseFloat(course.score) : null,
    grade,
    gradeLabel: band?.label || null,
    gradePoint,
    qualityPoints,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — request logger
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCS — HTML reference page served at /
// ─────────────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CGPA Calculator API — Docs</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
  :root{--navy:#0c1f3c;--emerald:#0F6E56;--gold:#BA7517;--danger:#A32D2D;--bg:#f4f6f9;--white:#fff;--border:#e0e7ef;--radius:10px;--shadow:0 2px 16px rgba(12,31,60,.07)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Syne',sans-serif;background:var(--bg);color:#1a1a2e;line-height:1.6}
  a{color:var(--emerald);text-decoration:none}a:hover{text-decoration:underline}
  .sidebar{position:fixed;top:0;left:0;width:240px;height:100vh;background:var(--navy);overflow-y:auto;padding:24px 0}
  .sidebar-logo{padding:0 20px 20px;border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:16px}
  .sidebar-logo h2{font-size:15px;color:#fff;font-weight:700}
  .sidebar-logo p{font-size:11px;color:rgba(255,255,255,.5);margin-top:2px}
  .nav-group{padding:0 12px;margin-bottom:8px}
  .nav-label{font-size:10px;font-weight:700;color:rgba(255,255,255,.35);letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;margin-bottom:4px}
  .nav-link{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;font-size:12px;color:rgba(255,255,255,.7);text-decoration:none;transition:all .15s}
  .nav-link:hover{background:rgba(255,255,255,.1);color:#fff;text-decoration:none}
  .nav-link .method{font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;font-family:'JetBrains Mono',monospace}
  .get{background:#0F6E5622;color:#4cd9a7}.post{background:#BA751722;color:#e8a83e}
  main{margin-left:240px;padding:40px 48px;max-width:960px}
  .hero{background:linear-gradient(135deg,var(--navy),#1a3057);border-radius:16px;padding:40px;color:#fff;margin-bottom:40px}
  .hero h1{font-size:2rem;margin-bottom:8px}.hero p{color:rgba(255,255,255,.7);font-size:14px}
  .hero-meta{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
  .pill{font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;background:rgba(255,255,255,.15);color:rgba(255,255,255,.9)}
  h2.section{font-size:1.2rem;color:var(--navy);margin:40px 0 16px;padding-bottom:10px;border-bottom:2px solid var(--border)}
  .endpoint{background:var(--white);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:20px;overflow:hidden;box-shadow:var(--shadow)}
  .endpoint-header{display:flex;align-items:center;gap:12px;padding:14px 20px;background:#fafbfc;border-bottom:1px solid var(--border)}
  .badge-method{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;flex-shrink:0}
  .badge-get{background:#E1F5EE;color:var(--emerald)}.badge-post{background:#FAEEDA;color:var(--gold)}
  .endpoint-path{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:var(--navy)}
  .endpoint-desc{font-size:13px;color:#556;margin-left:auto}
  .endpoint-body{padding:20px}
  .ep-section{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#889;margin-bottom:8px;margin-top:16px}
  .ep-section:first-child{margin-top:0}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 12px;background:#f8f9fa;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#889;border-bottom:1px solid var(--border)}
  td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  tr:last-child td{border:none}
  td code{font-family:'JetBrains Mono',monospace;font-size:12px;background:#f0f2f5;padding:1px 5px;border-radius:4px}
  .req{color:var(--danger);font-size:10px;font-weight:700}
  .opt{color:#889;font-size:10px}
  pre{background:#0c1f3c;color:#a8d8c0;font-family:'JetBrains Mono',monospace;font-size:12px;padding:16px;border-radius:8px;overflow-x:auto;line-height:1.6;margin-top:8px}
  .key{color:#7ab8e8}.str{color:#a8d8c0}.num{color:#f4c87e}.bool{color:#f4a27e}
  p.note{font-size:13px;color:#556;padding:12px 16px;background:#f8f9fa;border-left:3px solid var(--emerald);border-radius:0 6px 6px 0;margin-top:8px}
  .error-table td:first-child{font-family:'JetBrains Mono',monospace;color:var(--danger);font-weight:600}
  @media(max-width:700px){.sidebar{display:none}main{margin-left:0;padding:24px 16px}}
</style>
</head>
<body>

<nav class="sidebar">
  <div class="sidebar-logo">
    <h2>CGPA API</h2>
    <p>Nigerian 5.0 Scale · v1</p>
  </div>
  <div class="nav-group">
    <div class="nav-label">General</div>
    <a class="nav-link" href="#health"><span class="method get">GET</span> Health Check</a>
    <a class="nav-link" href="#scale"><span class="method get">GET</span> Grading Scale</a>
  </div>
  <div class="nav-group">
    <div class="nav-label">Grade Tools</div>
    <a class="nav-link" href="#score"><span class="method get">GET</span> Score → Grade</a>
    <a class="nav-link" href="#classify"><span class="method get">GET</span> GPA → Class</a>
  </div>
  <div class="nav-group">
    <div class="nav-label">Calculation</div>
    <a class="nav-link" href="#calculate"><span class="method post">POST</span> Calculate GPA</a>
    <a class="nav-link" href="#transcript"><span class="method post">POST</span> Full Transcript</a>
  </div>
  <div class="nav-group">
    <div class="nav-label">Reference</div>
    <a class="nav-link" href="#errors">Error Codes</a>
    <a class="nav-link" href="#examples">Code Examples</a>
  </div>
</nav>

<main>
  <div class="hero">
    <h1>CGPA Calculator API</h1>
    <p>A REST API for computing GPA, degree classification, and generating transcripts using the Nigerian 5.0 grading scale. Free to use — no authentication required.</p>
    <div class="hero-meta">
      <span class="pill">🌍 Nigerian 5.0 Scale</span>
      <span class="pill">📦 JSON only</span>
      <span class="pill">🔓 No auth required</span>
      <span class="pill">Base: /api/v1</span>
    </div>
  </div>

  <!-- ── HEALTH ── -->
  <h2 class="section" id="health">Health Check</h2>
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="badge-method badge-get">GET</span>
      <span class="endpoint-path">/api/v1/health</span>
      <span class="endpoint-desc">Check if the API is running</span>
    </div>
    <div class="endpoint-body">
      <div class="ep-section">Response</div>
      <pre><span class="key">"status"</span>: <span class="str">"ok"</span>,
<span class="key">"version"</span>: <span class="str">"v1"</span>,
<span class="key">"scale"</span>: <span class="str">"Nigerian 5.0"</span></pre>
    </div>
  </div>

  <!-- ── SCALE ── -->
  <h2 class="section" id="scale">Grading Scale</h2>
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="badge-method badge-get">GET</span>
      <span class="endpoint-path">/api/v1/scale</span>
      <span class="endpoint-desc">Returns the full grading scale and degree class boundaries</span>
    </div>
    <div class="endpoint-body">
      <div class="ep-section">Response</div>
      <pre><span class="key">"gradeBands"</span>: [{ <span class="key">"grade"</span>: <span class="str">"A"</span>, <span class="key">"points"</span>: <span class="num">5.0</span>, <span class="key">"min"</span>: <span class="num">70</span>, <span class="key">"max"</span>: <span class="num">100</span>, <span class="key">"label"</span>: <span class="str">"Distinction"</span> }, ...],
<span class="key">"degreeClasses"</span>: [{ <span class="key">"class"</span>: <span class="str">"First Class Honours"</span>, <span class="key">"min"</span>: <span class="num">4.50</span>, <span class="key">"max"</span>: <span class="num">5.00</span> }, ...]</pre>
    </div>
  </div>

  <!-- ── SCORE TO GRADE ── -->
  <h2 class="section" id="score">Score → Grade</h2>
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="badge-method badge-get">GET</span>
      <span class="endpoint-path">/api/v1/grade/:score</span>
      <span class="endpoint-desc">Convert a raw score to its grade and grade point</span>
    </div>
    <div class="endpoint-body">
      <div class="ep-section">URL Params</div>
      <table><tr><th>Param</th><th>Type</th><th>Description</th></tr>
      <tr><td><code>score</code> <span class="req">required</span></td><td>number</td><td>Raw score between 0 and 100</td></tr></table>
      <div class="ep-section">Example — GET /api/v1/grade/74</div>
      <pre>{ <span class="key">"score"</span>: <span class="num">74</span>, <span class="key">"grade"</span>: <span class="str">"A"</span>, <span class="key">"gradePoint"</span>: <span class="num">5.0</span>, <span class="key">"label"</span>: <span class="str">"Distinction"</span> }</pre>
    </div>
  </div>

  <!-- ── GPA CLASSIFY ── -->
  <h2 class="section" id="classify">GPA → Degree Class</h2>
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="badge-method badge-get">GET</span>
      <span class="endpoint-path">/api/v1/classify/:gpa</span>
      <span class="endpoint-desc">Classify a GPA into its degree class</span>
    </div>
    <div class="endpoint-body">
      <div class="ep-section">URL Params</div>
      <table><tr><th>Param</th><th>Type</th><th>Description</th></tr>
      <tr><td><code>gpa</code> <span class="req">required</span></td><td>number</td><td>GPA value between 0.00 and 5.00</td></tr></table>
      <div class="ep-section">Example — GET /api/v1/classify/4.62</div>
      <pre>{ <span class="key">"gpa"</span>: <span class="num">4.62</span>, <span class="key">"class"</span>: <span class="str">"First Class Honours"</span>, <span class="key">"min"</span>: <span class="num">4.50</span>, <span class="key">"max"</span>: <span class="num">5.00</span> }</pre>
    </div>
  </div>

  <!-- ── CALCULATE ── -->
  <h2 class="section" id="calculate">Calculate GPA</h2>
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="badge-method badge-post">POST</span>
      <span class="endpoint-path">/api/v1/calculate</span>
      <span class="endpoint-desc">Compute GPA and degree classification from a list of courses</span>
    </div>
    <div class="endpoint-body">
      <div class="ep-section">Request Body</div>
      <table>
        <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        <tr><td><code>courses</code> <span class="req">required</span></td><td>array</td><td>Array of course objects (min 1)</td></tr>
        <tr><td><code>courses[].code</code> <span class="req">required</span></td><td>string</td><td>Course code e.g. <code>"CSC 312"</code></td></tr>
        <tr><td><code>courses[].credits</code> <span class="req">required</span></td><td>number</td><td>Credit units (1–6)</td></tr>
        <tr><td><code>courses[].score</code> <span class="opt">optional*</span></td><td>number</td><td>Raw score 0–100. Converted to grade automatically</td></tr>
        <tr><td><code>courses[].grade</code> <span class="opt">optional*</span></td><td>string</td><td>Grade letter A/B/C/D/F. Used if score not provided</td></tr>
        <tr><td><code>courses[].title</code> <span class="opt">optional</span></td><td>string</td><td>Course title e.g. <code>"Data Structures"</code></td></tr>
      </table>
      <p class="note">* At least one of <code>score</code> or <code>grade</code> is required per course.</p>

      <div class="ep-section">Example Request</div>
      <pre>{
  <span class="key">"courses"</span>: [
    { <span class="key">"code"</span>: <span class="str">"CSC 312"</span>, <span class="key">"title"</span>: <span class="str">"Data Structures"</span>, <span class="key">"credits"</span>: <span class="num">3</span>, <span class="key">"score"</span>: <span class="num">74</span> },
    { <span class="key">"code"</span>: <span class="str">"MTH 301"</span>, <span class="key">"title"</span>: <span class="str">"Calculus"</span>,        <span class="key">"credits"</span>: <span class="num">2</span>, <span class="key">"score"</span>: <span class="num">61</span> },
    { <span class="key">"code"</span>: <span class="str">"GST 211"</span>, <span class="key">"title"</span>: <span class="str">"Communication"</span>,  <span class="key">"credits"</span>: <span class="num">2</span>, <span class="key">"grade"</span>: <span class="str">"C"</span> }
  ]
}</pre>

      <div class="ep-section">Response</div>
      <pre>{
  <span class="key">"success"</span>: <span class="bool">true</span>,
  <span class="key">"gpa"</span>: <span class="num">4.14</span>,
  <span class="key">"totalCredits"</span>: <span class="num">7</span>,
  <span class="key">"totalQualityPoints"</span>: <span class="num">29.0</span>,
  <span class="key">"classOfDegree"</span>: <span class="str">"Second Class Upper"</span>,
  <span class="key">"courses"</span>: [
    { <span class="key">"code"</span>: <span class="str">"CSC 312"</span>, <span class="key">"title"</span>: <span class="str">"Data Structures"</span>, <span class="key">"credits"</span>: <span class="num">3</span>, <span class="key">"score"</span>: <span class="num">74</span>, <span class="key">"grade"</span>: <span class="str">"A"</span>, <span class="key">"gradePoint"</span>: <span class="num">5.0</span>, <span class="key">"qualityPoints"</span>: <span class="num">15.0</span> },
    ...
  ]
}</pre>
    </div>
  </div>

  <!-- ── TRANSCRIPT ── -->
  <h2 class="section" id="transcript">Full Transcript</h2>
  <div class="endpoint">
    <div class="endpoint-header">
      <span class="badge-method badge-post">POST</span>
      <span class="endpoint-path">/api/v1/transcript</span>
      <span class="endpoint-desc">Generate a full academic transcript across multiple semesters</span>
    </div>
    <div class="endpoint-body">
      <div class="ep-section">Request Body</div>
      <table>
        <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        <tr><td><code>student</code> <span class="opt">optional</span></td><td>object</td><td>Student info: <code>name</code>, <code>matric</code>, <code>department</code>, <code>faculty</code>, <code>level</code></td></tr>
        <tr><td><code>semesters</code> <span class="req">required</span></td><td>array</td><td>Array of semester objects</td></tr>
        <tr><td><code>semesters[].label</code> <span class="req">required</span></td><td>string</td><td>e.g. <code>"100 Level First Semester"</code></td></tr>
        <tr><td><code>semesters[].courses</code> <span class="req">required</span></td><td>array</td><td>Same course format as <code>/calculate</code></td></tr>
      </table>

      <div class="ep-section">Example Request</div>
      <pre>{
  <span class="key">"student"</span>: { <span class="key">"name"</span>: <span class="str">"Austine Okonkwo"</span>, <span class="key">"matric"</span>: <span class="str">"CSC/2021/001"</span> },
  <span class="key">"semesters"</span>: [
    {
      <span class="key">"label"</span>: <span class="str">"100L First Semester"</span>,
      <span class="key">"courses"</span>: [
        { <span class="key">"code"</span>: <span class="str">"CSC 101"</span>, <span class="key">"credits"</span>: <span class="num">3</span>, <span class="key">"score"</span>: <span class="num">82</span> },
        { <span class="key">"code"</span>: <span class="str">"MTH 101"</span>, <span class="key">"credits"</span>: <span class="num">2</span>, <span class="key">"score"</span>: <span class="num">67</span> }
      ]
    },
    {
      <span class="key">"label"</span>: <span class="str">"100L Second Semester"</span>,
      <span class="key">"courses"</span>: [
        { <span class="key">"code"</span>: <span class="str">"CSC 102"</span>, <span class="key">"credits"</span>: <span class="num">3</span>, <span class="key">"score"</span>: <span class="num">55</span> }
      ]
    }
  ]
}</pre>

      <div class="ep-section">Response</div>
      <pre>{
  <span class="key">"success"</span>: <span class="bool">true</span>,
  <span class="key">"student"</span>: { <span class="key">"name"</span>: <span class="str">"Austine Okonkwo"</span>, <span class="key">"matric"</span>: <span class="str">"CSC/2021/001"</span> },
  <span class="key">"cgpa"</span>: <span class="num">4.25</span>,
  <span class="key">"totalCredits"</span>: <span class="num">8</span>,
  <span class="key">"totalQualityPoints"</span>: <span class="num">34.0</span>,
  <span class="key">"classOfDegree"</span>: <span class="str">"Second Class Upper"</span>,
  <span class="key">"semesters"</span>: [
    {
      <span class="key">"label"</span>: <span class="str">"100L First Semester"</span>,
      <span class="key">"gpa"</span>: <span class="num">4.60</span>,
      <span class="key">"credits"</span>: <span class="num">5</span>,
      <span class="key">"qualityPoints"</span>: <span class="num">23.0</span>,
      <span class="key">"courses"</span>: [...]
    },
    ...
  ]
}</pre>
    </div>
  </div>

  <!-- ── ERRORS ── -->
  <h2 class="section" id="errors">Error Codes</h2>
  <div class="endpoint">
    <div class="endpoint-body">
      <table class="error-table">
        <tr><th>HTTP</th><th>Meaning</th></tr>
        <tr><td>400</td><td>Bad request — missing or invalid fields. Check the <code>details</code> array.</td></tr>
        <tr><td>404</td><td>Endpoint not found.</td></tr>
        <tr><td>500</td><td>Internal server error.</td></tr>
      </table>
      <div class="ep-section" style="margin-top:12px">Error Response Shape</div>
      <pre>{ <span class="key">"success"</span>: <span class="bool">false</span>, <span class="key">"error"</span>: <span class="str">"No courses provided."</span>, <span class="key">"details"</span>: [<span class="str">"courses[0].score must be 0–100"</span>] }</pre>
    </div>
  </div>

  <!-- ── EXAMPLES ── -->
  <h2 class="section" id="examples">Code Examples</h2>
  <div class="endpoint">
    <div class="endpoint-body">
      <div class="ep-section">JavaScript (fetch)</div>
      <pre>const res = await fetch('http://localhost:3000/api/v1/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    courses: [
      { code: 'CSC 312', credits: 3, score: 74 },
      { code: 'MTH 301', credits: 2, score: 61 },
    ]
  })
});
const data = await res.json();
console.log(data.gpa, data.classOfDegree);</pre>

      <div class="ep-section">Python (requests)</div>
      <pre>import requests

res = requests.post('http://localhost:3000/api/v1/calculate', json={
    'courses': [
        {'code': 'CSC 312', 'credits': 3, 'score': 74},
        {'code': 'MTH 301', 'credits': 2, 'score': 61},
    ]
})
data = res.json()
print(data['gpa'], data['classOfDegree'])</pre>

      <div class="ep-section">cURL</div>
      <pre>curl -X POST http://localhost:3000/api/v1/calculate \\
  -H "Content-Type: application/json" \\
  -d '{"courses":[{"code":"CSC 312","credits":3,"score":74}]}'</pre>
    </div>
  </div>
</main>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/health
// ─────────────────────────────────────────────────────────────────────────────
app.get(`${BASE}/health`, (_req, res) => {
  success(res, { status: "ok", version: API_VERSION, scale: "Nigerian 5.0", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/scale
// ─────────────────────────────────────────────────────────────────────────────
app.get(`${BASE}/scale`, (_req, res) => {
  success(res, { gradeBands: SCORE_BANDS, degreeClasses: DEGREE_CLASSES });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/grade/:score
// ─────────────────────────────────────────────────────────────────────────────
app.get(`${BASE}/grade/:score`, (req, res) => {
  const score = parseFloat(req.params.score);
  if (isNaN(score) || score < 0 || score > 100) return fail(res, "Score must be a number between 0 and 100.");
  const band = scoreToGrade(score);
  if (!band) return fail(res, "Score out of range.", 400);
  success(res, { score, grade: band.grade, gradePoint: band.points, label: band.label });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/classify/:gpa
// ─────────────────────────────────────────────────────────────────────────────
app.get(`${BASE}/classify/:gpa`, (req, res) => {
  const gpa = parseFloat(req.params.gpa);
  if (isNaN(gpa) || gpa < 0 || gpa > 5) return fail(res, "GPA must be a number between 0.00 and 5.00.");
  const degreeClass = gpaToClass(gpa);
  success(res, { gpa, ...degreeClass });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/calculate
// ─────────────────────────────────────────────────────────────────────────────
app.post(`${BASE}/calculate`, (req, res) => {
  const { courses } = req.body || {};
  if (!Array.isArray(courses) || courses.length === 0) return fail(res, "courses must be a non-empty array.");

  const errors = courses.flatMap((c, i) => validateCourse(c, i));
  if (errors.length) return fail(res, "Validation failed.", 400, errors);

  const processed = courses.map(processCourse);
  const totalCredits = processed.reduce((s, c) => s + c.credits, 0);
  const totalQualityPoints = parseFloat(processed.reduce((s, c) => s + c.qualityPoints, 0).toFixed(2));
  const gpa = parseFloat((totalQualityPoints / totalCredits).toFixed(2));
  const degreeClass = gpaToClass(gpa);

  success(res, { gpa, totalCredits, totalQualityPoints, classOfDegree: degreeClass.class, courses: processed });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/transcript
// ─────────────────────────────────────────────────────────────────────────────
app.post(`${BASE}/transcript`, (req, res) => {
  const { student, semesters } = req.body || {};

  if (!Array.isArray(semesters) || semesters.length === 0) return fail(res, "semesters must be a non-empty array.");

  const semesterResults = [];
  const allErrors = [];

  for (let si = 0; si < semesters.length; si++) {
    const sem = semesters[si];
    if (!sem.label) { allErrors.push(`semesters[${si}].label is required`); continue; }
    if (!Array.isArray(sem.courses) || sem.courses.length === 0) { allErrors.push(`semesters[${si}].courses must be a non-empty array`); continue; }

    const courseErrors = sem.courses.flatMap((c, ci) => validateCourse(c, ci).map(e => `semesters[${si}]: ${e}`));
    allErrors.push(...courseErrors);
    if (courseErrors.length) continue;

    const processed = sem.courses.map(processCourse);
    const credits = processed.reduce((s, c) => s + c.credits, 0);
    const qualityPoints = parseFloat(processed.reduce((s, c) => s + c.qualityPoints, 0).toFixed(2));
    const gpa = parseFloat((qualityPoints / credits).toFixed(2));

    semesterResults.push({ label: sem.label, gpa, credits, qualityPoints, classOfDegree: gpaToClass(gpa).class, courses: processed });
  }

  if (allErrors.length) return fail(res, "Validation failed.", 400, allErrors);

  const totalCredits = semesterResults.reduce((s, r) => s + r.credits, 0);
  const totalQualityPoints = parseFloat(semesterResults.reduce((s, r) => s + r.qualityPoints, 0).toFixed(2));
  const cgpa = parseFloat((totalQualityPoints / totalCredits).toFixed(2));
  const degreeClass = gpaToClass(cgpa);

  success(res, {
    student: student || null,
    cgpa,
    totalCredits,
    totalQualityPoints,
    classOfDegree: degreeClass.class,
    semesters: semesterResults,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 catch-all
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  fail(res, `Cannot ${req.method} ${req.path}. See docs at http://localhost:${PORT}`, 404);
});

app.listen(PORT, () => {
  console.log(`\n  CGPA Calculator API`);
  console.log(`  Docs  → http://localhost:${PORT}`);
  console.log(`  Base  → http://localhost:${PORT}${BASE}\n`);
});