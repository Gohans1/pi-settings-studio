/** What this app cannot change, and where it is changed instead: a pane of the General workbench. */
export function NotHere() {
  return <section className="not-here" aria-labelledby="not-here-title">
    <header className="detail-header"><h2 id="not-here-title">Not editable here</h2></header>
    <ul>
      <li><strong>Environment variables</strong> such as <code>PI_CODING_AGENT_DIR</code>, <code>PI_CODING_AGENT_SESSION_DIR</code>, <code>PI_PROGRAM_STATUS</code> and provider keys like <code>OPENAI_API_KEY</code>: they belong to the environment Pi starts in. Check credential only sees this app's environment.</li>
      <li><strong>Command-line options</strong> such as <code>--model</code>, <code>--tools</code>, <code>--session-dir</code> and <code>--no-mcp</code>: whatever launches Pi chooses them for each run.</li>
      <li><strong>Running threads</strong>: their model, connected MCP servers and loaded extensions. This app edits files; a thread picks them up after <code>/reload</code>, or a new thread starts with them.</li>
      <li><strong>Sessions and chat history</strong>: Pi keeps them. The System prompt tab only reads them.</li>
      <li><strong>Files inside installed packages</strong>: change them at their source, or choose what loads with package filters in Plugins.</li>
      <li><strong>Settings of third-party extensions</strong> kept in their own files.</li>
      <li><strong>Stored keys and tokens</strong>: write-only on purpose; they are never shown.</li>
    </ul>
  </section>;
}
