#!/bin/bash

while ! nc -z localhost $1; do   
  sleep 0.1
done
