import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def write_csv_report(report_path, evidence_data):

    # ===== Change output to .xlsx =====
    report_path = report_path.replace(".csv", ".xlsx")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Forensic Evidence"

    # ===== Column Definitions =====
    fieldnames = [
        "Case ID", "Investigator", "System Name",
        "File Name", "File Path", "File Type",
        "File Size (KB)", "Permissions", "Anomaly Flag",
        "Created Time", "Modified Time", "Accessed Time",
        "SHA256 Hash", "MD5 Hash", "Status",
        "Risk Level", "Category", "Evidence Collected On"
    ]

    # ===== Styles =====
    header_font  = Font(name="Arial", bold=True, color="FFFFFF", size=10)
    header_fill  = PatternFill("solid", fgColor="1F3864")
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align   = Alignment(horizontal="left", vertical="center", wrap_text=True)
    thin_border  = Border(
        left   = Side(style="thin", color="CCCCCC"),
        right  = Side(style="thin", color="CCCCCC"),
        top    = Side(style="thin", color="CCCCCC"),
        bottom = Side(style="thin", color="CCCCCC")
    )

    # ===== Risk Level Colors =====
    risk_colors = {
        "Critical" : "FF0000",
        "High"     : "FF6600",
        "Medium"   : "FFC000",
        "Low"      : "00B050",
    }

    # ===== Write Header Row =====
    for col_num, field in enumerate(fieldnames, start=1):
        cell           = ws.cell(row=1, column=col_num, value=field)
        cell.font      = header_font
        cell.fill      = header_fill
        cell.alignment = center_align
        cell.border    = thin_border

    ws.row_dimensions[1].height = 30

    # ===== Write Data Rows =====
    for row_num, record in enumerate(evidence_data, start=2):

        row_fill = PatternFill("solid", fgColor="EEF2FF") if row_num % 2 == 0 else PatternFill("solid", fgColor="FFFFFF")

        for col_num, field in enumerate(fieldnames, start=1):
            value          = record.get(field, "")
            cell           = ws.cell(row=row_num, column=col_num, value=value)
            cell.font      = Font(name="Arial", size=9)
            cell.alignment = left_align
            cell.border    = thin_border
            cell.fill      = row_fill

        # ===== Color the Risk Level Cell =====
        risk_col  = fieldnames.index("Risk Level") + 1
        risk_cell = ws.cell(row=row_num, column=risk_col)
        risk_val  = record.get("Risk Level", "")
        if risk_val in risk_colors:
            risk_cell.fill      = PatternFill("solid", fgColor=risk_colors[risk_val])
            risk_cell.font      = Font(name="Arial", bold=True, size=9,
                                  color="FFFFFF" if risk_val in ["Critical", "High"] else "000000")
            risk_cell.alignment = center_align

    # ===== Column Widths =====
    col_widths = {
        "Case ID"            : 14,
        "Investigator"       : 14,
        "System Name"        : 24,
        "File Name"          : 28,
        "File Path"          : 40,
        "File Type"          : 10,
        "File Size (KB)"     : 14,
        "Permissions"        : 26,
        "Anomaly Flag"       : 28,
        "Created Time"       : 20,
        "Modified Time"      : 20,
        "Accessed Time"      : 20,
        "SHA256 Hash"        : 66,
        "MD5 Hash"           : 36,
        "Status"             : 28,
        "Risk Level"         : 12,
        "Category"           : 28,
        "Evidence Collected On" : 20
    }
    for col_num, field in enumerate(fieldnames, start=1):
        ws.column_dimensions[get_column_letter(col_num)].width = col_widths.get(field, 18)

    # ===== Freeze Header Row =====
    ws.freeze_panes = "A2"

    # ===== Summary Sheet =====
    ws2 = wb.create_sheet(title="Summary")

    ws2["A1"]           = "FORENSIC INVESTIGATION SUMMARY"
    ws2["A1"].font      = Font(name="Arial", bold=True, size=14, color="1F3864")
    ws2["A1"].alignment = center_align
    ws2.merge_cells("A1:B1")
    ws2.row_dimensions[1].height = 30

    summary_data = [
        ("Total Files Scanned", len(evidence_data)),
        ("High Risk Files",     sum(1 for f in evidence_data if f.get("Risk Level") == "High")),
        ("Low Risk Files",      sum(1 for f in evidence_data if f.get("Risk Level") == "Low")),
        ("Anomalies Detected",  sum(1 for f in evidence_data if f.get("Anomaly Flag", "None") != "None")),
    ]

    for i, (label, value) in enumerate(summary_data, start=2):
        ws2.cell(row=i, column=1, value=label).font  = Font(name="Arial", bold=True, size=10)
        ws2.cell(row=i, column=2, value=value).font  = Font(name="Arial", size=10)
        ws2.cell(row=i, column=1).border = thin_border
        ws2.cell(row=i, column=2).border = thin_border
        ws2.cell(row=i, column=1).fill   = PatternFill("solid", fgColor="EEF2FF")

    ws2.column_dimensions["A"].width = 28
    ws2.column_dimensions["B"].width = 14

    wb.save(report_path)