#!/bin/sh
# Installs the pre-commit hook that re-stamps asset versions (tools/bump-version.mjs)
# whenever a commit touches the site's code. Run once per clone: sh tools/install-hooks.sh
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
if git diff --cached --name-only | grep -qE '^(src/|styles/|index\.html|desktop\.html)'; then
  node tools/bump-version.mjs >/dev/null && git add index.html desktop.html
fi
EOF
chmod +x .git/hooks/pre-commit
echo "pre-commit hook installed"
