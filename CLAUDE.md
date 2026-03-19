# Integration Summary

## Plan Branch
agent/1f835417-2111-44a1-8917-4c062d8dacdb

## Suggested PR Title
fix(security): address security review findings

## Suggested PR Description
1. scrollback buffer uses unbounded memory — cap at configured limit. 2. getScrollbackLines() returns a mutable reference to the internal array.

---

## Original Task

**Description**: 

**Acceptance Criteria**: