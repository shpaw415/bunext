#!/bin/env bash

bun clear-build
bash ./git.sh "$*"
bunpm publish