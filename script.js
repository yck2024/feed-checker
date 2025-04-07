const fileInput = document.getElementById('csvFileInput');
const resultsDiv = document.getElementById('results');

const MAX_LINES_FOR_DETECTION = 20; // How many lines to check to GUESS the delimiter
const COMMON_DELIMITERS = [',', ';', '\t', '|']; // Comma, Semicolon, Tab, Pipe

fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(event) {
    // ... (handleFileSelect remains the same as the previous version) ...
    const file = event.target.files[0];
    resultsDiv.innerHTML = '<p class="info">Processing file...</p>';

    if (!file) {
        resultsDiv.innerHTML = '<p class="warning">No file selected.</p>';
        return;
    }

    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
         resultsDiv.innerHTML = `<p class="warning">Warning: Selected file (${file.name}) doesn't have a .csv extension. Attempting to process anyway.</p>`;
         // Allow processing to continue
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const text = e.target.result;
            if (!text || text.trim().length === 0) {
                resultsDiv.innerHTML = '<p class="error">Error: File is empty or could not be read.</p>';
                return;
            }
            analyzeCsvContent(text);
        } catch (error) {
             resultsDiv.innerHTML = `<p class="error">Error reading file: ${error.message}</p>`;
             console.error("Error reading file:", error);
        }
    };

    reader.onerror = function(e) {
        resultsDiv.innerHTML = `<p class="error">Error reading file: ${reader.error}</p>`;
        console.error("File reading error:", reader.error);
    };

    // Read the file as text
    reader.readAsText(file);
}


function analyzeCsvContent(csvText) {
    const lines = csvText.split(/\r?\n/);
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const totalNonEmptyRows = nonEmptyLines.length;

    if (totalNonEmptyRows === 0) {
        resultsDiv.innerHTML = '<p class="warning">File contains no data rows after trimming empty lines.</p>';
        return;
    }

    // --- Step 1: Delimiter Detection (using a sample) ---
    const sampleLines = nonEmptyLines.slice(0, MAX_LINES_FOR_DETECTION);
    const sampleSize = sampleLines.length;
    let detectedDelimiter = null;
    let expectedColumnCount = 0;
    let detectionConfidence = 'low';

    function getMostFrequent(arr) { /* ... (getMostFrequent remains the same) ... */
        if (!arr || arr.length === 0) return null;
        const counts = arr.reduce((map, val) => {
            map[val] = (map[val] || 0) + 1;
            return map;
        }, {});
        let mostFrequentVal = arr[0];
        let maxCount = 0;
        for (const val in counts) {
            if (counts[val] > maxCount) {
                maxCount = counts[val];
                mostFrequentVal = val;
            }
        }
        const numVal = parseInt(mostFrequentVal, 10);
        return !isNaN(numVal) ? numVal : mostFrequentVal;
    }

    let bestGuess = { delimiter: null, count: 0, consistency: 0 };
    for (const delimiter of COMMON_DELIMITERS) { /* ... (detection logic remains the same) ... */
        const columnCountsInSample = sampleLines.map(line => line.split(delimiter).length);
        if (columnCountsInSample.length === 0) continue;
        const firstCount = columnCountsInSample[0];
        const isConsistentInSample = columnCountsInSample.every(count => count === firstCount);
        if (isConsistentInSample) {
            if (firstCount > bestGuess.count) {
                 bestGuess = { delimiter: delimiter, count: firstCount, consistency: 1 };
            } else if (firstCount === bestGuess.count && bestGuess.consistency < 1) {
                 bestGuess = { delimiter: delimiter, count: firstCount, consistency: 1 };
            }
        } else {
            if (bestGuess.consistency === 0) {
                const mostFrequentCount = getMostFrequent(columnCountsInSample);
                if (mostFrequentCount > bestGuess.count && mostFrequentCount > 1) {
                    bestGuess = { delimiter: delimiter, count: mostFrequentCount, consistency: 0 };
                }
            }
        }
    }

    detectedDelimiter = bestGuess.delimiter;
    expectedColumnCount = bestGuess.count;
    detectionConfidence = bestGuess.consistency === 1 ? 'high' : 'low';

    // --- Step 2: Validation & Display (using ALL non-empty lines) ---
    let resultHTML = '';
    let validationIssues = {
        columnCount: [],      // { line, count }
        leadingTrailingWhitespace: [], // { line, fieldIndex }
        malformedQuotes: [],  // { line, fieldIndex }
        unescapedQuotes: [],  // { line, fieldIndex }
        emptyLastField: []    // { line }
    };
    let firstLineEndsWithDelimiter = null;
    let foundIssues = false;

    if (detectedDelimiter) {
        const delimiterName = detectedDelimiter === '\t' ? 'Tab (\\t)' : `'${detectedDelimiter}'`;
        const confidenceText = detectionConfidence === 'high' ? '(High Confidence - Consistent in Sample)' : '(Low Confidence - Inconsistent in Sample)';
        resultHTML += `<h2>Analysis Results</h2>`;
        resultHTML += `<p><span class="info">Detected Delimiter:</span> ${delimiterName} <span class="info">${confidenceText}</span></p>`;
        resultHTML += `<p><span class="info">Expected Columns (based on detection):</span> ${expectedColumnCount}</p>`;
        resultHTML += `<p><span class="info">Total Non-Empty Data Rows:</span> ${totalNonEmptyRows}</p>`;
        resultHTML += `<hr>`;
        resultHTML += `<h3>Detailed Checks (All ${totalNonEmptyRows} Non-Empty Rows):</h3>`;

        // *** Perform all checks on ALL non-empty lines ***
        for (let i = 0; i < totalNonEmptyRows; i++) {
            const currentLine = nonEmptyLines[i];
            const originalLineNumber = lines.indexOf(currentLine) + 1;
            const fields = currentLine.split(detectedDelimiter); // Simple split - CAVEAT HERE
            const columnCount = fields.length;

            // --- Check 1: Column Count ---
            if (columnCount !== expectedColumnCount) {
                validationIssues.columnCount.push({ line: originalLineNumber, count: columnCount });
                foundIssues = true;
            }

            // --- Check 2: Inconsistent Empty Last Field ---
            const endsWithDelimiter = currentLine.endsWith(detectedDelimiter);
            if (i === 0) {
                firstLineEndsWithDelimiter = endsWithDelimiter;
            } else if (endsWithDelimiter !== firstLineEndsWithDelimiter) {
                 // Only add if it differs from the first line's pattern
                 // Avoid adding every line if the *first* line is the odd one out
                if (validationIssues.emptyLastField.length < 10) { // Limit reporting
                    validationIssues.emptyLastField.push({ line: originalLineNumber });
                }
                 foundIssues = true;
            }

            // --- Field-level Checks (Whitespace, Quoting) ---
            for (let j = 0; j < fields.length; j++) {
                const field = fields[j];

                // --- Check 3: Leading/Trailing Whitespace ---
                if (field !== field.trim() && validationIssues.leadingTrailingWhitespace.length < 10) {
                    validationIssues.leadingTrailingWhitespace.push({ line: originalLineNumber, fieldIndex: j + 1 });
                    foundIssues = true;
                }

                // --- Quoting Checks (Heuristics - may have limitations) ---
                const startsWithQuote = field.startsWith('"');
                const endsWithQuote = field.endsWith('"');

                // --- Check 4: Malformed Quoting ---
                if (startsWithQuote !== endsWithQuote && field !== '""') { // Exclude the valid "" field
                    if (validationIssues.malformedQuotes.length < 10) {
                         validationIssues.malformedQuotes.push({ line: originalLineNumber, fieldIndex: j + 1 });
                    }
                    foundIssues = true;
                }
                // --- Check 5: Unescaped Quotes within Quoted Field ---
                else if (startsWithQuote && endsWithQuote && field.length > 1) { // Check non-empty quoted fields
                    const innerContent = field.substring(1, field.length - 1);
                    // Regex: Look for a quote (") that is NOT preceded by a quote (?<!) and NOT followed by a quote (?!")
                    if (/(?<!")"(?!")/.test(innerContent)) {
                        if (validationIssues.unescapedQuotes.length < 10) {
                            validationIssues.unescapedQuotes.push({ line: originalLineNumber, fieldIndex: j + 1 });
                        }
                        foundIssues = true;
                    }
                }
            } // End field loop
        } // End line loop

        // --- Display Validation Results ---
        resultHTML += "<ul>";

        // Column Count
        if (validationIssues.columnCount.length === 0) {
            resultHTML += `<li><span class="success">[OK]</span> Column Count: Consistent (${expectedColumnCount} columns).</li>`;
        } else {
            resultHTML += `<li><span class="error">[ISSUE]</span> Column Count: Inconsistent! Expected ${expectedColumnCount} columns. Found issues on ${validationIssues.columnCount.length} row(s).`;
            resultHTML += `<ul>`;
            validationIssues.columnCount.slice(0, 5).forEach(issue => {
                resultHTML += `<li>Line ${issue.line}: Found ${issue.count} columns</li>`;
            });
            if (validationIssues.columnCount.length > 5) resultHTML += `<li>... and ${validationIssues.columnCount.length - 5} more</li>`;
            resultHTML += `</ul></li>`;
        }

        // Empty Last Field
        if (validationIssues.emptyLastField.length === 0) {
             resultHTML += `<li><span class="success">[OK]</span> Empty Last Field: Consistent (all lines ${firstLineEndsWithDelimiter ? 'end' : 'do not end'} with the delimiter).</li>`;
        } else {
             resultHTML += `<li><span class="warning">[POTENTIAL ISSUE]</span> Empty Last Field: Inconsistent! First line ${firstLineEndsWithDelimiter ? 'ends' : 'does not end'} with delimiter, but ${validationIssues.emptyLastField.length} other row(s) differ (showing first few):`;
             resultHTML += `<ul>`;
             validationIssues.emptyLastField.slice(0, 5).forEach(issue => {
                 resultHTML += `<li>Line ${issue.line} has different ending</li>`;
             });
             resultHTML += `</ul></li>`;
        }

         // Whitespace
        if (validationIssues.leadingTrailingWhitespace.length === 0) {
             resultHTML += `<li><span class="success">[OK]</span> Leading/Trailing Whitespace: None detected in fields.</li>`;
        } else {
             resultHTML += `<li><span class="warning">[POTENTIAL ISSUE]</span> Leading/Trailing Whitespace: Found in fields on ${validationIssues.leadingTrailingWhitespace.length} location(s) (showing first few):`;
             resultHTML += `<ul>`;
             validationIssues.leadingTrailingWhitespace.slice(0, 5).forEach(issue => {
                 resultHTML += `<li>Line ${issue.line}, Field ${issue.fieldIndex}</li>`;
             });
             if (validationIssues.leadingTrailingWhitespace.length > 5) resultHTML += `<li>... and ${validationIssues.leadingTrailingWhitespace.length - 5} more</li>`;
             resultHTML += `</ul></li>`;
        }

        // Malformed Quoting
        if (validationIssues.malformedQuotes.length === 0) {
             resultHTML += `<li><span class="success">[OK]</span> Malformed Quoting: No fields found starting/ending with quotes inconsistently (heuristic check).</li>`;
        } else {
             resultHTML += `<li><span class="error">[ISSUE]</span> Malformed Quoting: Found potential issues on ${validationIssues.malformedQuotes.length} location(s) (showing first few):`;
             resultHTML += `<ul>`;
             validationIssues.malformedQuotes.slice(0, 5).forEach(issue => {
                 resultHTML += `<li>Line ${issue.line}, Field ${issue.fieldIndex} (check if quotes are balanced)</li>`;
             });
             if (validationIssues.malformedQuotes.length > 5) resultHTML += `<li>... and ${validationIssues.malformedQuotes.length - 5} more</li>`;
             resultHTML += `</ul></li>`;
        }

        // Unescaped Quotes
        if (validationIssues.unescapedQuotes.length === 0) {
             resultHTML += `<li><span class="success">[OK]</span> Unescaped Quotes: No single quotes found within quoted fields (heuristic check).</li>`;
        } else {
             resultHTML += `<li><span class="warning">[POTENTIAL ISSUE]</span> Unescaped Quotes: Found potential unescaped double-quotes (\") inside quoted fields on ${validationIssues.unescapedQuotes.length} location(s) (showing first few):`;
             resultHTML += `<p class='info'>(Note: Standard CSV escape is usually doubling the quote: "")</p><ul>`;
             validationIssues.unescapedQuotes.slice(0, 5).forEach(issue => {
                 resultHTML += `<li>Line ${issue.line}, Field ${issue.fieldIndex}</li>`;
             });
             if (validationIssues.unescapedQuotes.length > 5) resultHTML += `<li>... and ${validationIssues.unescapedQuotes.length - 5} more</li>`;
             resultHTML += `</ul></li>`;
        }

        resultHTML += "</ul>"; // End of detailed checks list

        if (!foundIssues) {
             resultHTML += `<p class="success">Overall Status: Looks good based on these checks!</p>`;
        } else {
             resultHTML += `<p class="warning">Overall Status: Potential issues found. Review the details above.</p>`;
             resultHTML += `<p class="info"><strong>Important:</strong> These checks (especially quoting) use simple methods and may not catch all complex CSV errors. For absolute certainty with complex files, consider using a dedicated CSV parsing library.</p>`;
        }


        // --- File Preview ---
        const previewLinesCount = Math.min(totalNonEmptyRows, 15);
        const previewLines = nonEmptyLines.slice(0, previewLinesCount);
        resultHTML += `<hr><h3>File Preview (first ${previewLinesCount} non-empty lines):</h3><pre>${previewLines.join('\n')}</pre>`;

    } else {
        // Delimiter detection failed entirely
        resultHTML = `<h2>Analysis Results</h2>`; // Use h2 for consistency
        resultHTML += `<p><span class="error">Delimiter Detection Failed:</span> Could not reliably determine a common delimiter (${COMMON_DELIMITERS.map(d => d==='\t'?'\\t':d).join(', ')}) based on the first ${sampleSize} lines.</p>`;
        resultHTML += `<p class="info">The file might use an uncommon delimiter, be significantly corrupted, empty, or not be a delimited text file.</p>`;

        // Show preview even if detection failed
        const previewLinesCount = Math.min(totalNonEmptyRows, 15);
        const previewLines = nonEmptyLines.slice(0, previewLinesCount);
        resultHTML += `<hr><h3>File Preview (first ${previewLinesCount} non-empty lines):</h3><pre>${previewLines.join('\n')}</pre>`;
    }

    resultsDiv.innerHTML = resultHTML;
}
