#!/bin/env bash

bun clear-build
git add .
git commit -m "$*"
git push