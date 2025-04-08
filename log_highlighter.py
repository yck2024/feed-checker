import re
import os
import sys
from colorama import init, Fore, Style

def extract_and_highlight_issues(file_path, context_lines=2):
    """
    Extract headers and issue rows with context from a log file and highlight the issue rows.
    
    Args:
        file_path (str): Path to the log file
        context_lines (int): Number of lines of context to show above and below issue rows
    """
    # Initialize colorama for cross-platform colored terminal output
    init()
    
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            lines = file.readlines()
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return
    
    # Patterns for headers and issue rows
    header_pattern = re.compile(r'^\* \*\*\[ISSUE\]\*\*.*$')
    issue_row_pattern = re.compile(r'^\s*\* Row \d+:.*$')
    
    result = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        
        # Check if the line is a header
        if header_pattern.match(line):
            result.append(f"{Fore.CYAN}{line}{Style.RESET_ALL}")
            i += 1
            continue
            
        # Check if the line is an issue row
        if issue_row_pattern.match(line):
            # Get context lines before
            start_idx = max(0, i - context_lines)
            for j in range(start_idx, i):
                result.append(lines[j].rstrip())
            
            # Add the highlighted issue row
            result.append(f"{Fore.RED}{line}{Style.RESET_ALL}")
            
            # Get context lines after
            end_idx = min(len(lines), i + context_lines + 1)
            for j in range(i + 1, end_idx):
                result.append(lines[j].rstrip())
                
            # Add a separator for readability
            result.append("-" * 80)
        
        i += 1
    
    # Print the results
    for line in result:
        print(line)

if __name__ == "__main__":
    # Check if colorama is installed, if not, prompt the user
    try:
        import colorama
    except ImportError:
        print("Error: 'colorama' package not found.")
        print("Please install it using: pip install colorama")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python log_highlighter.py <log_file_path> [context_lines]")
        sys.exit(1)
    
    file_path = sys.argv[1]
    context_lines = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    
    extract_and_highlight_issues(file_path, context_lines)
