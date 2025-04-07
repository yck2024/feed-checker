const fileInput = document.getElementById('csvFileInput');
const resultsDiv = document.getElementById('results');

const MAX_LINES_FOR_DETECTION = 20; // How many lines to check to GUESS the delimiter
const COMMON_DELIMITERS = [',', ';', '\t', '|']; // Comma, Semicolon, Tab, Pipe

fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(event) {
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
    const lines = csvText.split(/\r?\n/); // Split by new line (Windows or Unix)

    // Filter out empty lines (often present at the end of files)
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const totalNonEmptyRows = nonEmptyLines.length;

    if (totalNonEmptyRows === 0) {
         resultsDiv.innerHTML = '<p class="warning">File contains no data rows after trimming empty lines.</p>';
         return;
    }

    // --- Step 1: Delimiter Detection (using a sample for performance) ---
    // We analyze the first few lines to guess the delimiter. Checking every line for
    // every potential delimiter would be too slow for large files.
    const sampleLines = nonEmptyLines.slice(0, MAX_LINES_FOR_DETECTION);
    const sampleSize = sampleLines.length; // Actual number of lines sampled

    let detectedDelimiter = null;
    let expectedColumnCount = 0; // The column count we expect based on detection
    let detectionConfidence = 'low'; // 'high' if consistent in sample, 'low' otherwise

    // Helper to get the most frequent element in an array
    function getMostFrequent(arr) {
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
                mostFrequentVal = val; // val will be a string key here
            }
        }
        // Try converting back to number if it looks like one
        const numVal = parseInt(mostFrequentVal, 10);
        return !isNaN(numVal) ? numVal : mostFrequentVal;
    }


    // --- Detection Logic ---
    let bestGuess = { delimiter: null, count: 0, consistency: 0 }; // consistency: 1=perfect, 0=imperfect

    for (const delimiter of COMMON_DELIMITERS) {
        const columnCountsInSample = sampleLines.map(line => line.split(delimiter).length);

        if (columnCountsInSample.length === 0) continue; // Should not happen if nonEmptyLines > 0

        const firstCount = columnCountsInSample[0];
        const isConsistentInSample = columnCountsInSample.every(count => count === firstCount);

        if (isConsistentInSample) {
             // If consistent and results in more columns than previous best, it's a good candidate
            if (firstCount > bestGuess.count) {
                 bestGuess = { delimiter: delimiter, count: firstCount, consistency: 1 };
                 // console.log(`New best guess (consistent): ${delimiter} -> ${firstCount} cols`);
            }
            // If consistent and same column count, prefer comma/semicolon/tab over pipe (arbitrary tie-break)
            else if (firstCount === bestGuess.count && bestGuess.consistency < 1) {
                 bestGuess = { delimiter: delimiter, count: firstCount, consistency: 1 };
                 // console.log(`New best guess (tie-break consistency): ${delimiter} -> ${firstCount} cols`);
            }
        } else {
            // If inconsistent, but we don't have a consistent guess yet
            if (bestGuess.consistency === 0) {
                const mostFrequentCount = getMostFrequent(columnCountsInSample);
                 // Consider it only if it splits better than the current fallback
                if (mostFrequentCount > bestGuess.count && mostFrequentCount > 1) {
                    bestGuess = { delimiter: delimiter, count: mostFrequentCount, consistency: 0 };
                    // console.log(`New best guess (inconsistent fallback): ${delimiter} -> ${mostFrequentCount} cols (most frequent)`);
                }
            }
        }
    }

    detectedDelimiter = bestGuess.delimiter;
    expectedColumnCount = bestGuess.count;
    detectionConfidence = bestGuess.consistency === 1 ? 'high' : 'low';


    // --- Step 2: Validation & Display (using ALL non-empty lines) ---
    let resultHTML = '';

    if (detectedDelimiter) {
        const delimiterName = detectedDelimiter === '\t' ? 'Tab (\\t)' : `'${detectedDelimiter}'`;
        const confidenceText = detectionConfidence === 'high' ? '(High Confidence - Consistent in Sample)' : '(Low Confidence - Inconsistent in Sample)';
        resultHTML += `<p><span class="success">Detected Delimiter:</span> ${delimiterName} <span class="info">${confidenceText}</span></p>`;
        resultHTML += `<p><span class="info">Expected Columns (based on detection):</span> ${expectedColumnCount}</p>`;

        // *** Check ALL non-empty lines for consistency ***
        let inconsistentLineNumbers = []; // Store {lineNumber, count} for inconsistencies
        for (let i = 0; i < totalNonEmptyRows; i++) {
            const currentLine = nonEmptyLines[i];
            const columnCount = currentLine.split(detectedDelimiter).length;
            if (columnCount !== expectedColumnCount) {
                // Record 1-based line number and the count found
                inconsistentLineNumbers.push({ line: lines.indexOf(currentLine) + 1, count: columnCount });
                 // Note: lines.indexOf might be slow for huge files, but necessary to get original line number
                 // An alternative is to just use `i + 1` relative to non-empty lines, but original line number is often more useful.
            }
        }

        // --- Display Results ---
        if (inconsistentLineNumbers.length === 0) {
            resultHTML += `<p><span class="success">Format Check (All ${totalNonEmptyRows} Non-Empty Rows):</span> OK! Consistent number of columns (${expectedColumnCount}) found.</p>`;
        } else {
            resultHTML += `<p><span class="warning">Format Check (All ${totalNonEmptyRows} Non-Empty Rows):</span> FAILED! Inconsistent number of columns found.</p>`;
            resultHTML += `<p class="info">- Expected ${expectedColumnCount} columns.</p>`;
            resultHTML += `<p class="info">- Found ${inconsistentLineNumbers.length} row(s) with a different column count.</p>`;

            // Display details of the first few inconsistent lines for easier debugging
            const linesToShow = Math.min(inconsistentLineNumbers.length, 5);
            resultHTML += `<p class="info">- First ${linesToShow} inconsistencies (Original Line Number):</p><ul>`;
            for(let i = 0; i < linesToShow; i++) {
                const item = inconsistentLineNumbers[i];
                resultHTML += `<li>Line ${item.line}: Found ${item.count} columns</li>`;
            }
            if (inconsistentLineNumbers.length > linesToShow) {
                 resultHTML += `<li>... (${inconsistentLineNumbers.length - linesToShow} more)</li>`;
            }
            resultHTML += `</ul>`;
            resultHTML += `<p class="info">Check these lines for issues like missing/extra delimiters, or unescaped delimiters within quoted fields (this simple checker doesn't handle quoted fields perfectly).</p>`;
        }

        // --- File Preview ---
        const previewLinesCount = Math.min(totalNonEmptyRows, 15); // Show up to 15 lines
        const previewLines = nonEmptyLines.slice(0, previewLinesCount);
        resultHTML += `<hr><p class="info"><b>File Preview (first ${previewLinesCount} non-empty lines):</b></p><pre>${previewLines.join('\n')}</pre>`;

    } else {
        // Delimiter detection failed entirely
        resultHTML += `<p><span class="error">Delimiter Detection Failed:</span> Could not reliably determine a common delimiter (${COMMON_DELIMITERS.map(d => d==='\t'?'\\t':d).join(', ')}) based on the first ${sampleSize} lines.</p>`;
        resultHTML += `<p class="info">The file might use an uncommon delimiter, be significantly corrupted, empty, or not be a delimited text file.</p>`;

        // Show preview even if detection failed
        const previewLinesCount = Math.min(totalNonEmptyRows, 15);
        const previewLines = nonEmptyLines.slice(0, previewLinesCount);
        resultHTML += `<hr><p class="info"><b>File Preview (first ${previewLinesCount} non-empty lines):</b></p><pre>${previewLines.join('\n')}</pre>`;
    }

    resultsDiv.innerHTML = resultHTML;
}
