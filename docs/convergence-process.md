# Convergence Testing Process

## History

### Rounds 1-9: Multi-Agent Design

Rounds 1 through 9 used seven parallel convergence agents, each analyzing the
grammar from a different angle (correctness, adversarial, coverage, AST design,
type system, conflicts, limitations). Each agent ran as an independent process.

This design had systemic problems:
- **Timeout failures**: Four of seven agents in Round 9 timed out before
  completing. Partial results could not be trusted.
- **Non-determinism**: Agent ordering, system load, and timeout timing varied
  between runs. "Converged" in one run could become "not converged" in the next.
- **No reproducibility**: Different seeds, different file ordering, different
  adversarial inputs on each run. No way to replay a specific convergence check.
- **Noisy output**: Seven separate reports had to be manually synthesized.
  Contradictions between agents went undetected.

### Round 10: Unified Harness

The multi-agent design was replaced with a single Python harness
(`convergence/round10.py`) that runs all analyses in one deterministic pass.

This was a **process change** from the original Round 10 specification, which
called for seven agents. The change was made because:

1. The timeout problem made the multi-agent approach unreliable. Four of seven
   Round 9 agents timed out, producing incomplete results that could not be
   trusted for a convergence claim.
2. A single process has deterministic execution order. No race conditions, no
   load-dependent timing.
3. All analyses share the same build artifact and corpus state. No risk of
   agents seeing different grammar versions.
4. The harness is seedable (`--seed N`) and reproducible.
5. Total execution time is under 30 seconds, versus 10+ minutes for seven
   agents with timeouts.

**What was lost**: The multi-agent design had independent failure domains —
one agent crashing didn't affect the others. The unified harness has a single
failure point. This is acceptable because the harness is a ~700-line Python
script with no external dependencies, and any crash produces a clear traceback.

**What was gained**: Reproducibility, determinism, complete coverage on every
run, machine-readable JSON output, and the ability to run the full convergence
check as a pre-commit hook.

## Current Process

The harness implements five mandatory checks:

1. **Example file parsing**: Enumerates all files in `examples/` at runtime
   using `Path.glob`. Parses each with `tree-sitter parse`. Any ERROR or MISSING
   node is a P1 finding.

2. **Adversarial input generation**: Generates N novel inputs from parameterized
   templates. Templates cover feature combinations, boundary conditions, and
   grammar paths with low corpus coverage. Seeded for reproducibility.
   Any ERROR or MISSING in generated inputs is a P1 finding.

3. **Known-limitations re-validation**: Reads `docs/known-limitations.md` and
   confirms each item still holds. Items fixed in previous rounds are removed.
   Items that no longer apply are escalated to P1.

4. **Uncovered grammar rules**: Extracts all named rules from `grammar.ts` and
   cross-references against node types found in corpus test parse trees.
   Rules not covered by any test are flagged as P2.

5. **Branch coverage**: For each `choice()` rule in the grammar, checks whether
   every alternative is exercised by at least one corpus test. Uncovered
   alternatives are flagged as P2.

### Convergence Criteria

- **P1 = 0**: No ERROR or MISSING nodes in example files, no ERROR in
  adversarial inputs, no escalated known limitations.
- **P2**: Listed but not blocking. Uncovered rules and branches are tracked
  for future work.
- **CONVERGED** means P1 = 0 under the current process. The convergence claim
  is qualified by the process version.

### Vocabulary

The term "agents" refers to the historical multi-agent design. The current
implementation is "the harness" (`convergence/round10.py`). Future process
changes (e.g., adding new analyses, changing the harness architecture) must
be flagged in the convergence report as changes, not folded into the
implementation status table.

## Running the Harness

```bash
cd tree-sitter-pike
python3 convergence/round10.py --seed 42 --adversarial-count 55
```

Output: stdout summary + `convergence/round10_report.json` (machine-readable).
