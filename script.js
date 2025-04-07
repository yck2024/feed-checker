const fileInput = document.getElementById('csvFileInput');
const resultsDiv = document.getElementById('results');

fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(event) {
    const file = event.target.files[0];
    resultsDiv.innerHTML = '<p class="info">Processing file...</p>';

    if (!file) {
        resultsDiv.innerHTML = '<p class="warning">No file selected.</p>';
        return;
    }

    // Basic check for file type - PapaParse will handle the actual parsing
    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.csv') && !fileNameLower.endsWith('.tsv')) {
         resultsDiv.innerHTML = `<p class="warning">Warning: Selected file (${file.name}) doesn't have a common .csv or .tsv extension. Attempting to process anyway...</p>`;
         // Let PapaParse try
    }

    // --- Use PapaParse ---
    Papa.parse(file, {
        skipEmptyLines: true, // Skip empty lines
        header: false,        // Don't treat first row as header
        dynamicTyping: false, // Keep all fields as strings
        complete: processPapaparseResults, // Callback on success
        error: handlePapaparseError    // Callback on file reading error
        // Add 'step' function here later for streaming large files if needed
    });
}

function handlePapaparseError(error, file) {
    console.error("PapaParse Error:", error, file);
    resultsDiv.innerHTML = `<p class="error">Error reading or parsing file: ${error.message || error}</p>`;
}

function processPapaparseResults(results) {
    console.log("PapaParse Results:", results); // Log for debugging

    const data = results.data; // Array of arrays (rows)
    const errors = results.errors; // Array of parsing errors
    const meta = results.meta; // Metadata (delimiter, etc.)

    const totalRows = data.length;
    let resultHTML = '<h2>Analysis Results</h2>';

    // --- 1. Display Metadata ---
    if (meta.delimiter) {
        const delimiterName = meta.delimiter === '\t' ? 'Tab (\\t)' : `'${meta.delimiter}'`;
        resultHTML += `<p><span class="info">Detected Delimiter:</span> ${delimiterName}</p>`;
    } else {
        resultHTML += `<p><span class="warning">Delimiter:</span> Could not be reliably detected by PapaParse.</p>`;
    }
    resultHTML += `<p><span class="info">Total Rows Processed (non-empty):</span> ${totalRows}</p>`;
    resultHTML += `<p><span class="info">File Encoding:</span> ${meta.encoding || 'Default (likely UTF-8)'}</p>`; // PapaParse might detect encoding
    resultHTML += `<hr>`;

    // --- 2. Display Parsing Errors (from PapaParse) ---
    resultHTML += `<h3>Parsing Errors (Reported by PapaParse):</h3>`;
    if (errors.length === 0) {
        resultHTML += `<ul><li><span class="success">[OK]</span> No parsing errors reported by PapaParse.</li></ul>`;
    } else {
        resultHTML += `<ul>`;
        errors.slice(0, 10).forEach(err => {
            resultHTML += `<li><span class="error">[ERROR]</span> Type: ${err.type}, Code: ${err.code}, Message: ${err.message} (Row: ${err.row + 1})</li>`; // PapaParse row index is 0-based
        });
        if (errors.length > 10) resultHTML += `<li>... and ${errors.length - 10} more parsing errors</li>`;
        resultHTML += `</ul>`;
    }
    resultHTML += `<hr>`;

    // --- 3. Perform Additional Checks (if data exists) ---
    resultHTML += `<h3>Additional Checks:</h3>`;
    let validationIssues = {
        columnCount: [],             // { line, count }
        leadingTrailingWhitespace: [] // { line, fieldIndex }
    };
    let expectedColumnCount = 0;
    let foundIssues = errors.length > 0; // Start with true if PapaParse found errors

    if (totalRows > 0) {
        expectedColumnCount = data[0].length; // Assume first row sets the standard
        resultHTML += `<p><span class="info">Expected Columns (based on first row):</span> ${expectedColumnCount}</p>`;

        for (let i = 0; i < totalRows; i++) {
            const row = data[i];
            const currentLineNumber = i + 1; // 1-based for display
            const columnCount = row.length;

            // --- Check 1: Column Count ---
            if (columnCount !== expectedColumnCount) {
                if (validationIssues.columnCount.length < 10) { // Limit reporting
                    validationIssues.columnCount.push({ line: currentLineNumber, count: columnCount });
                }
                foundIssues = true;
            }

            // --- Check 2: Leading/Trailing Whitespace ---
            for (let j = 0; j < row.length; j++) {
                const field = row[j];
                // Check only if field is a string (PapaParse might do dynamic typing if enabled)
                if (typeof field === 'string' && field !== field.trim()) {
                    if (validationIssues.leadingTrailingWhitespace.length < 10) { // Limit reporting
                         validationIssues.leadingTrailingWhitespace.push({ line: currentLineNumber, fieldIndex: j + 1 });
                    }
                    foundIssues = true;
                }
            }
        }

        // --- Display Validation Results ---
        resultHTML += "<ul>";

        // Column Count
        if (validationIssues.columnCount.length === 0) {
            resultHTML += `<li><span class="success">[OK]</span> Column Count: Consistent (${expectedColumnCount} columns across ${totalRows} rows).</li>`;
        } else {
            resultHTML += `<li><span class="error">[ISSUE]</span> Column Count: Inconsistent! Expected ${expectedColumnCount} columns (based on row 1). Found issues on ${validationIssues.columnCount.length} row(s).`;
            resultHTML += `<ul>`;
            validationIssues.columnCount.slice(0, 5).forEach(issue => {
                resultHTML += `<li>Row ${issue.line}: Found ${issue.count} columns</li>`;
            });
            if (validationIssues.columnCount.length > 5) resultHTML += `<li>... and ${validationIssues.columnCount.length - 5} more</li>`;
            resultHTML += `</ul></li>`;
        }

        // Whitespace
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
        resultHTML += "</ul>";

    } else if (errors.length === 0) {
         resultHTML += `<p class="warning">File appears to be empty or contains only empty lines.</p>`;
    } else {
         resultHTML += `<p class="info">No additional checks performed due to parsing errors or empty data.</p>`;
    }


    // --- 4. Overall Status ---
     resultHTML += `<hr>`;
     if (!foundIssues && totalRows > 0) {
         resultHTML += `<p class="success">Overall Status: Looks good! PapaParse reported no errors and additional checks passed.</p>`;
     } else if (totalRows > 0) {
         resultHTML += `<p class="warning">Overall Status: Issues found. Review PapaParse errors and additional checks above.</p>`;
     } else if (errors.length > 0) {
         resultHTML += `<p class="error">Overall Status: Parsing errors encountered. File may be corrupted or not in a standard CSV/TSV format.</p>`;
     } else { // Empty file case
         resultHTML += `<p class="warning">Overall Status: File is empty or contains no data rows.</p>`;
     }


    // --- 5. File Preview ---
    if (totalRows > 0) {
        const previewLinesCount = Math.min(totalRows, 15);
        // Need to format the data array back into a string for preview
        const previewText = data.slice(0, previewLinesCount)
            .map(row => row.map(field => {
                // Basic quoting for preview if field contains delimiter or quotes
                const delimiter = meta.delimiter || ','; // Default to comma for quoting check
                if (typeof field === 'string' && (field.includes(delimiter) || field.includes('"'))) {
                    // Escape internal quotes by doubling them for CSV representation
                    return `"${field.replace(/"/g, '""')}"`;
                }
                return field;
            }).join(meta.delimiter || ',')) // Join fields with detected delimiter
            .join('\n'); // Join rows with newline

        resultHTML += `<hr><h3>File Preview (first ${previewLinesCount} rows as parsed):</h3><pre>${escapeHtml(previewText)}</pre>`;
    }

    resultsDiv.innerHTML = resultHTML;
}

// Simplified helper function to escape HTML for display in <pre> tag
// Removed the problematic double quote replacement to avoid syntax errors
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        console.warn("escapeHtml called with non-string value:", unsafe);
        unsafe = String(unsafe);
    }
    let safe = unsafe;
    safe = safe.replace(/&/g, "&");
    safe = safe.replace(/</g, "<");
    safe = safe.replace(/>/g, ">");
    // safe = safe.replace(/"/g, """); // Temporarily removed
    safe = safe.replace(/'/g, "&#039;");
    return safe;
 }
