const fileInput = document.getElementById('csvFileInput');
const resultsDiv = document.getElementById('results');

fileInput.addEventListener('change', handleFileSelect);

// --- State Variables for Streaming ---
let analysisState = {};

function resetAnalysisState() {
    analysisState = {
        totalRows: 0,
        expectedColumnCount: null, // Determined by the first row
        firstRowData: null,
        validationIssues: {
            columnCount: [],             // { line, count }
            leadingTrailingWhitespace: [] // { line, fieldIndex }
        },
        parsingErrors: [], // Errors from PapaParse step/complete
        previewData: [],   // Store first few rows for preview
        foundIssues: false, // Flag if any issues are detected
        startTime: 0,
        meta: {} // Store metadata like delimiter, encoding
    };
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    resultsDiv.innerHTML = '<p class="info">Processing file...</p>';

    if (!file) {
        resultsDiv.innerHTML = '<p class="warning">No file selected.</p>';
        return;
    }

    // Basic check for file type
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.csv') && !fileNameLower.endsWith('.tsv')) {
         resultsDiv.innerHTML = `<p class="warning">Warning: Selected file (${file.name}) doesn't have a common .csv or .tsv extension. Attempting to process anyway...</p>`;
         // Let PapaParse try, but the warning remains
    }

    // --- Reset State and Start Streaming Parse ---
    resetAnalysisState();
    analysisState.startTime = performance.now();

    Papa.parse(file, {
        worker: true,         // Use a web worker for performance
        step: handleStep,     // Process row by row
        complete: handleComplete, // Finalize after streaming
        error: handlePapaparseError, // Handle file reading errors
        skipEmptyLines: true,
        header: false,
        dynamicTyping: false,
        // Keep encoding detection, PapaParse does this well
    });
}

function handlePapaparseError(error, file) {
    console.error("PapaParse Error:", error, file);
    const message = error.message || (error.type ? `${error.type}: ${error.code}` : String(error));
    resultsDiv.innerHTML = `<p class="error">Error reading or parsing file: ${message}</p>`;
    // Reset state if needed, although usually parsing stops here
    resetAnalysisState();
}

// --- Process Data Row by Row ---
function handleStep(results, parser) {
    // results.data contains one row here
    // results.errors contains errors for this specific step/row
    // results.meta contains info like delimiter, linebreak, fields (if header:true)

    // Store metadata on first step
    if (analysisState.totalRows === 0) {
        analysisState.meta = { ...results.meta }; // Copy meta on first step
        analysisState.firstRowData = results.data; // Store first row data
        analysisState.expectedColumnCount = results.data.length; // Set expected columns
    }

    // --- Collect Parsing Errors from Step ---
    if (results.errors.length > 0) {
        results.errors.forEach(err => {
            // Add row number information if missing (PapaParse step errors might not have it)
            err.row = err.row ?? analysisState.totalRows; // Use current row count as approximation
            if (analysisState.parsingErrors.length < 20) { // Limit stored errors
                analysisState.parsingErrors.push(err);
            }
            analysisState.foundIssues = true;
        });
    }

    // --- Perform Additional Checks ---
    const row = results.data;
    const currentLineNumber = analysisState.totalRows + 1; // 1-based for display
    const columnCount = row.length;

    // Store for preview (limit size)
    if (analysisState.previewData.length < 15) {
        analysisState.previewData.push(row);
    }

    // Check 1: Column Count (only if expected count is set)
    if (analysisState.expectedColumnCount !== null && columnCount !== analysisState.expectedColumnCount) {
        if (analysisState.validationIssues.columnCount.length < 10) { // Limit reporting
            analysisState.validationIssues.columnCount.push({ line: currentLineNumber, count: columnCount });
        }
        analysisState.foundIssues = true;
    }

    // Check 2: Leading/Trailing Whitespace
    for (let j = 0; j < row.length; j++) {
        const field = row[j];
        if (typeof field === 'string' && field !== field.trim()) {
            if (analysisState.validationIssues.leadingTrailingWhitespace.length < 10) { // Limit reporting
                 analysisState.validationIssues.leadingTrailingWhitespace.push({ line: currentLineNumber, fieldIndex: j + 1 });
            }
            // This is often just a warning, might not set foundIssues = true unless strict
            // analysisState.foundIssues = true;
        }
    }

    analysisState.totalRows++;

    // Optional: Update UI periodically for very large files
    if (analysisState.totalRows % 10000 === 0) {
         resultsDiv.innerHTML = `<p class="info">Processing... Row ${analysisState.totalRows.toLocaleString()}</p>`;
    }
}

// --- Finalize and Display Results ---
function handleComplete(results) {
    const endTime = performance.now();
    const duration = ((endTime - analysisState.startTime) / 1000).toFixed(2);
    console.log("PapaParse Complete Results:", results); // Log final results (includes meta, errors)

    // Process any final errors reported in the complete callback, if available
    // We rely on analysisState.meta captured during the first step, as results.meta might be incomplete here when using workers.
    if (results && results.errors) {
        results.errors.forEach(err => {
             // Add row number if missing
             err.row = err.row ?? analysisState.totalRows; // Use final row count if needed
             if (analysisState.parsingErrors.length < 20) { // Limit stored errors
                 analysisState.parsingErrors.push(err);
             }
             analysisState.foundIssues = true;
        });
    } else {
        console.warn("PapaParse complete callback received incomplete results object (no errors array). Relying solely on errors found during step phase.");
    }


    let resultHTML = `<h2>Analysis Results</h2>`;
    resultHTML += `<p><span class="info">Processing Time:</span> ${duration} seconds</p>`;

    // --- 1. Display Metadata ---
    const meta = analysisState.meta;
    if (meta.delimiter) {
        const delimiterName = meta.delimiter === '\t' ? 'Tab (\\t)' : `'${meta.delimiter}'`;
        resultHTML += `<p><span class="info">Detected Delimiter:</span> ${delimiterName}</p>`;
    } else {
        resultHTML += `<p><span class="warning">Delimiter:</span> Could not be reliably detected.</p>`;
    }
    resultHTML += `<p><span class="info">Total Rows Processed (non-empty):</span> ${analysisState.totalRows.toLocaleString()}</p>`;
    resultHTML += `<p><span class="info">File Encoding:</span> ${meta.encoding || 'Default (likely UTF-8)'}</p>`;
    resultHTML += `<hr>`;

    // --- 2. Display Parsing Errors ---
    resultHTML += `<h3>Parsing Errors (Reported by PapaParse):</h3>`;
    const errors = analysisState.parsingErrors;
    if (errors.length === 0) {
        resultHTML += `<ul><li><span class="success">[OK]</span> No parsing errors reported.</li></ul>`;
    } else {
        resultHTML += `<ul>`;
        errors.slice(0, 10).forEach(err => {
            resultHTML += `<li><span class="error">[ERROR]</span> Type: ${err.type}, Code: ${err.code}, Message: ${err.message} (Row: ~${err.row + 1})</li>`; // PapaParse row index is 0-based
        });
        if (errors.length > 10) resultHTML += `<li>... and ${errors.length - 10} more parsing errors</li>`;
        resultHTML += `</ul>`;
    }
    resultHTML += `<hr>`;

    // --- 3. Display Additional Checks ---
    resultHTML += `<h3>Additional Checks:</h3>`;
    const validationIssues = analysisState.validationIssues;
    const expectedColumnCount = analysisState.expectedColumnCount;
    const totalRowsProcessed = analysisState.totalRows; // Use a local var for clarity

    if (totalRowsProcessed > 0) {
        resultHTML += "<ul>"; // Start list for checks

        // Display expected column count info
        if (expectedColumnCount !== null) {
             resultHTML += `<p><span class="info">Expected Columns (based on first row):</span> ${expectedColumnCount}</p>`;
        } else {
             resultHTML += `<p><span class="warning">Could not determine expected column count from the first row processed. Column consistency check might be less reliable.</span></p>`;
        }

        // Column Count Check Results
        if (expectedColumnCount !== null) { // Only show consistency if we have an expectation
            if (validationIssues.columnCount.length === 0) {
                resultHTML += `<li><span class="success">[OK]</span> Column Count: Consistent (${expectedColumnCount} columns across ${totalRowsProcessed.toLocaleString()} rows).</li>`;
            } else {
                resultHTML += `<li><span class="error">[ISSUE]</span> Column Count: Inconsistent! Expected ${expectedColumnCount} columns. Found issues on ${validationIssues.columnCount.length} row(s).`;
                resultHTML += `<ul>`;
                validationIssues.columnCount.slice(0, 5).forEach(issue => {
                    resultHTML += `<li>Row ${issue.line}: Found ${issue.count} columns</li>`;
                });
                if (validationIssues.columnCount.length > 5) resultHTML += `<li>... and ${validationIssues.columnCount.length - 5} more</li>`;
                resultHTML += `</ul></li>`;
            }
        } else {
             // If expectedColumnCount is null, we can still report if *any* inconsistencies were found, just without comparing to a specific number
             if (validationIssues.columnCount.length > 0) {
                 resultHTML += `<li><span class="error">[ISSUE]</span> Column Count: Inconsistent row lengths detected on ${validationIssues.columnCount.length} row(s) (showing first few):`;
                 resultHTML += `<ul>`;
                 validationIssues.columnCount.slice(0, 5).forEach(issue => {
                     resultHTML += `<li>Row ${issue.line}: Found ${issue.count} columns</li>`;
                 });
                 if (validationIssues.columnCount.length > 5) resultHTML += `<li>... and ${validationIssues.columnCount.length - 5} more</li>`;
                 resultHTML += `</ul></li>`;
             } else {
                 // Cannot confirm consistency without expected count, but no variations were logged
                 resultHTML += `<li><span class="info">[INFO]</span> Column Count: Could not determine expected count, but no variations were logged during processing.</li>`;
             }
        }


        // Whitespace Check Results
        if (validationIssues.leadingTrailingWhitespace.length === 0) {
             resultHTML += `<li><span class="success">[OK]</span> Leading/Trailing Whitespace: None detected in fields.</li>`;
        } else {
             resultHTML += `<li><span class="warning">[POTENTIAL ISSUE]</span> Leading/Trailing Whitespace: Found in fields on ${validationIssues.leadingTrailingWhitespace.length} location(s) (showing first few):`;
             resultHTML += `<ul>`;
             validationIssues.leadingTrailingWhitespace.slice(0, 5).forEach(issue => {
                 resultHTML += `<li>Row ${issue.line}, Field ${issue.fieldIndex}</li>`;
             });
             if (validationIssues.leadingTrailingWhitespace.length > 5) resultHTML += `<li>... and ${validationIssues.leadingTrailingWhitespace.length - 5} more</li>`;
             resultHTML += `</ul></li>`;
        }
        resultHTML += "</ul>"; // End list for checks

    } else { // No rows processed
         if (errors.length === 0) {
            resultHTML += `<p class="warning">File appears to be empty or contains only empty lines. No additional checks performed.</p>`;
         } else {
            resultHTML += `<p class="info">No rows processed, likely due to parsing errors. No additional checks performed.</p>`;
         }
    }


    // --- 4. Overall Status ---
     resultHTML += `<hr>`; // Keep the separator
     if (!analysisState.foundIssues && analysisState.totalRows > 0) {
         resultHTML += `<p class="success">Overall Status: Looks good! No significant errors reported and additional checks passed.</p>`;
     } else if (analysisState.totalRows > 0) {
         resultHTML += `<p class="warning">Overall Status: Issues found. Review PapaParse errors and additional checks above.</p>`;
     } else if (errors.length > 0) {
         resultHTML += `<p class="error">Overall Status: Parsing errors encountered. File may be corrupted or not in a standard CSV/TSV format.</p>`;
     } else { // Empty file case
         resultHTML += `<p class="warning">Overall Status: File is empty or contains no data rows.</p>`;
     }

    // --- 5. File Preview ---
    if (analysisState.previewData.length > 0) {
        const previewLinesCount = analysisState.previewData.length;
        const previewText = analysisState.previewData
            .map(row => row.map(field => {
                const delimiter = meta.delimiter || ',';
                if (typeof field === 'string' && (field.includes(delimiter) || field.includes('"'))) {
                    return `"${field.replace(/"/g, '""')}"`;
                }
                return field;
            }).join(meta.delimiter || ','))
            .join('\n');

        resultHTML += `<hr><h3>File Preview (first ${previewLinesCount} rows as parsed):</h3><pre>${escapeHtml(previewText)}</pre>`;
    }

    resultsDiv.innerHTML = resultHTML;
}


// Simplified helper function to escape HTML for display in <pre> tag
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        console.warn("escapeHtml called with non-string value:", unsafe);
        unsafe = String(unsafe);
    }
    // Basic escaping for HTML display
    return unsafe
    .replace(/&/g, "&amp;")  // Use &amp; for ampersand
    .replace(/</g, "&lt;")   // Use &lt; for less than
    .replace(/>/g, "&gt;")   // Use &gt; for greater than
    .replace(/"/g, "&quot;") // Use &quot; for double quote
    .replace(/'/g, "&#039;"); // Use &#039; for single quote
 }
