import { getLastLogError } from "../src/cloudwatch_logs";

describe("getLastLogError", () => {
    test("extracts last line of Python traceback", () => {
        const lines = [
            "Starting sync_jurisdictions...",
            "Traceback (most recent call last):",
            '  File "/app/manage.py", line 10, in <module>',
            "    execute_from_command_line(sys.argv)",
            '  File "/app/lcvista/sync.py", line 45, in sync',
            '    raise IntegrityError("duplicate key")',
            "django.db.utils.IntegrityError: duplicate key value violates unique constraint",
        ];
        expect(getLastLogError(lines)).toBe(
            "django.db.utils.IntegrityError: duplicate key value violates unique constraint"
        );
    });

    test("falls back to last ERROR/FATAL line when no traceback", () => {
        const lines = [
            "Starting sync...",
            "INFO: Loading data",
            "ERROR: Failed to connect to database",
            "FATAL: Aborting sync",
            "Done.",
        ];
        expect(getLastLogError(lines)).toBe("FATAL: Aborting sync");
    });

    test("falls back to last log line when no errors found", () => {
        const lines = ["Processing item 1", "Processing item 2", "Processing item 3"];
        expect(getLastLogError(lines)).toBe("Processing item 3");
    });

    test("returns placeholder for empty logs", () => {
        expect(getLastLogError([])).toBe("(no log output captured)");
    });

    test("uses last traceback when multiple tracebacks exist", () => {
        const lines = [
            "Traceback (most recent call last):",
            '  File "/app/first.py", line 1, in f',
            "ValueError: first error",
            "Retrying...",
            "Traceback (most recent call last):",
            '  File "/app/second.py", line 5, in g',
            "TypeError: second error",
        ];
        expect(getLastLogError(lines)).toBe("TypeError: second error");
    });
});
