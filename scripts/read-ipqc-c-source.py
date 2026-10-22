"""Read the supplied XLSX without altering it or depending on installed Excel packages."""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def column_index(address):
    letters = re.match(r"[A-Z]+", address).group()
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result - 1


def cell_text(cell, strings):
    if cell.find(f"{{{MAIN}}}f") is not None:
        raise ValueError(f"Formula cell is not allowed: {cell.get('r')}")
    kind = cell.get("t")
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(f".//{{{MAIN}}}t"))
    value = cell.find(f"{{{MAIN}}}v")
    if value is None or value.text is None:
        return ""
    if kind == "s":
        return strings[int(value.text)]
    if kind == "b":
        return "TRUE" if value.text == "1" else "FALSE"
    return value.text


def main(path):
    with zipfile.ZipFile(path) as source:
        workbook = ET.fromstring(source.read("xl/workbook.xml"))
        sheet = next((item for item in workbook.findall(f".//{{{MAIN}}}sheet")
                      if item.get("name") == "IPQC_LINE_C"), None)
        if sheet is None:
            raise ValueError("IPQC_LINE_C sheet not found")
        rel_id = sheet.get(f"{{{REL}}}id")
        relations = ET.fromstring(source.read("xl/_rels/workbook.xml.rels"))
        relation = next(item for item in relations.findall(f"{{{PKG}}}Relationship")
                        if item.get("Id") == rel_id)
        target = relation.get("Target").lstrip("/")
        sheet_path = target if target.startswith("xl/") else "xl/" + target
        strings = []
        if "xl/sharedStrings.xml" in source.namelist():
            shared = ET.fromstring(source.read("xl/sharedStrings.xml"))
            strings = ["".join(node.text or "" for node in item.findall(f".//{{{MAIN}}}t"))
                       for item in shared.findall(f"{{{MAIN}}}si")]
        document = ET.fromstring(source.read(sheet_path))
        rows = []
        for row in document.findall(f".//{{{MAIN}}}sheetData/{{{MAIN}}}row"):
            number = int(row.get("r"))
            if number < 1 or number > 863:
                continue
            cells = [""] * 16
            for cell in row.findall(f"{{{MAIN}}}c"):
                index = column_index(cell.get("r"))
                if index < 16:
                    cells[index] = cell_text(cell, strings)
            rows.append({"row": number, "cells": cells})
        if not rows or rows[0]["row"] != 1:
            raise ValueError("Header row is missing")
        print(json.dumps({"headers": rows[0]["cells"], "rows": rows[1:]}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
