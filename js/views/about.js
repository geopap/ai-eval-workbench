import { section, pageHead } from '../ui.js';

export function render() {
  return `
    ${pageHead('About this project', 'Evals that product teams use and governance can trust', 'Eval platforms are built for engineers. Product managers own “what good looks like”, and AI governance needs evidence that it holds — but both still work in documents and spreadsheets. This workbench is the layer between them.')}
    <div class="grid-2">
      ${section('The problem', `<ul class="checklist">
        <li><b>“Good” lives in documents.</b> Rubrics, must-never rules and release bars sit outside any tool.</li>
        <li><b>Error analysis dead-ends.</b> Teams find failure patterns, but they never become prioritised backlog items.</li>
        <li><b>No ship/no-ship moment.</b> Scores exist; a clear release decision with a named owner does not.</li>
        <li><b>Judges are trusted blindly.</b> LLM-as-judge only works after it is checked against human labels.</li>
        <li><b>No bridge to compliance.</b> EU AI Act Art. 15 expects declared accuracy metrics and testing across the life cycle — eval results are rarely packaged as evidence.</li></ul>`)}
      ${section('The loop', `<ol class="reasoning">
        <li><b>Define</b> — an eval spec with rubrics, must-never rules and release bars, in place of a requirements document.</li>
        <li><b>Discover</b> — people review real conversations, write what went wrong, and group notes into failure modes until no new ones appear.</li>
        <li><b>Act</b> — failure modes are ranked by risk, ticketed in Jira, fixed, and verified by regression evals built from their examples.</li>
        <li><b>Decide</b> — judges are calibrated against human labels; a versioned gate recommends ship / no-ship; a person signs off.</li>
        <li><b>Prove</b> — an evidence pack for the AI governance office: declared metrics, life-cycle testing, risk register, audit trail.</li></ol>`)}
    </div>
    <div class="grid-2">
      ${section('Design choices', `<ul class="checklist">
        <li><b>Tool-neutral.</b> The eval market is consolidating fast into model providers and observability suites; specs, labels, failure modes and decisions should not depend on one vendor. Results import from any tool.</li>
        <li><b>People in the loop.</b> Blind review by default, tickets created only on a click, and a named person for every release decision.</li>
        <li><b>Binary verdicts.</b> Pass/fail with a written reason is easier to calibrate and act on than 1–10 scores.</li>
        <li><b>No backend needed.</b> Jira works through pre-filled screens and CSV; an optional Worker adds two-way sync without exposing the token.</li></ul>`)}
      ${section('Try it', `<ol class="reasoning">
        <li>Open the <a href="#/review">review queue</a> and work through the ten unreviewed conversations — one hides a failure nobody has named yet.</li>
        <li>Create a new failure mode for it, then open it on <a href="#/failures">Failure modes</a> and preview the Jira ticket.</li>
        <li>On <a href="#/judge">Judge calibration</a>, see why the tone judge is not trusted.</li>
        <li>Compare release candidates on the <a href="#/gate">release gate</a> and sign off.</li>
        <li>Print the <a href="#/evidence">evidence pack</a>.</li></ol>
        <p class="small muted">All data is synthetic; Varnholt Group is a fictional company. Part of a trilogy with <a href="https://geopap.github.io/ai-use-case-intake/" target="_blank" rel="noopener">AI Use-Case Intake</a> and <a href="https://geopap.github.io/ai-portfolio-office/" target="_blank" rel="noopener">AI Portfolio Office</a>.</p>`)}
    </div>`;
}
