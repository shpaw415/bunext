#!/bin/env bash

bun clear
git add .
git commit -m "$*"
git push