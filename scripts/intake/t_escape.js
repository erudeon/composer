/**
 * The escapes, each pinned by the corruption it lets through when it is done as a chain.
 *
 * All three were found by CodeQL on a repository that had been running for days. Two were real and
 * silent: an author writing about markup lost what they wrote, and a table cell holding a backslash
 * split into two columns. The third was a false positive, and it is pinned here so that stays true.
 */
const assert = require("node:assert");
const { stripTags } = require("./lib.js");
const { escapeLatex } = require("./omml.js");

/* A chained unescape decodes its own output: `&amp;lt;` became `<` instead of `&lt;`. */
const { textOf } = require("./open-docx.js");
const run = (t) => textOf(`<w:t>${t}</w:t>`);
assert.equal(run("&amp;lt;"), "&lt;", "an entity written by the author must survive");
assert.equal(run("&amp;amp;"), "&amp;");
assert.equal(run("&lt;script&gt;"), "<script>");
assert.equal(run("a &amp; b"), "a & b");
assert.equal(run("&quot;x&quot; &#39;y&#39;"), '"x" \'y\'');

/* Escaping the pipe alone left a bare pipe behind, and the cell split. */
const { gfmTable } = require("./docx-core.js");
const [header] = gfmTable([["a\\|b", "plain"]]);
assert.equal(header, "| a\\\\\\|b | plain |", `a backslash and a pipe must both be escaped: ${header}`);
/* What matters is how MARKDOWN reads the row: an unescaped pipe is a column break and nothing else is. */
const cells = header.split(/(?<!\\)\|/).slice(1, -1);
assert.equal(cells.length, 2, `the row must still be two cells, not ${cells.length}: ${header}`);
assert.equal(cells[0].trim(), "a\\\\\\|b", "the cell keeps its backslash and its pipe, both escaped");

/* The LaTeX escape was a false positive, and these are why. */
assert.equal(escapeLatex("\\"), "\\backslash ");
assert.equal(escapeLatex("{"), "\\{");
assert.equal(escapeLatex("\\{"), "\\backslash \\{");
assert.equal(escapeLatex("\\&"), "\\backslash \\&");
/*
 * A CARET IS A SUPERSCRIPT AND STAYS ONE. It used to become `\\wedge`, which renders logical AND: the
 * author's `0^2` reached a live course as `0∧2`. Word writes a real superscript as `<m:sSup>`, so a
 * caret in a text run is somebody typing one, and a bare `^` is already a LaTeX superscript.
 */
assert.equal(escapeLatex("a^b~c"), "a^b\\sim c");
assert.equal(escapeLatex("D = (-6)(-2) - 0^2 = 12"), "D = (-6)(-2) - 0^2 = 12");
assert.equal(escapeLatex("100%"), "100\\%");
/*
 * Nothing it writes may be escaped a second time. Two backslashes in means two `\backslash` commands
 * out and not four, which is what a chain that could see its own output would produce.
 */
const twice = escapeLatex("\\\\");
assert.equal((twice.match(/backslash/g) ?? []).length, 2, `two in, two out: ${twice}`);
assert.equal(twice, "\\backslash \\backslash ");

/* Stripping tags runs to a fixpoint, so a malformed part cannot leave one behind. */
assert.equal(stripTags("<w:t>a</w:t>"), "a");
/* A `<` inside an attribute ends the match early, so the leftovers are text. That is the honest
 * result for a malformed part, and the point of the loop is only that no TAG survives it. */
assert.equal(stripTags('<w:t a="<b>">x</w:t>'), '">x');
assert.ok(!stripTags("<<script>script>alert(1)<</script>/script>").includes("<script"));
assert.equal(stripTags("no tags here"), "no tags here");

console.log("escapes ok");
