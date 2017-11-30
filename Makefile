SHELL := /bin/bash
export SHELLOPTS := errexit:pipefail

publish:
	rsync -av . indra:/opt/htdocs/methylation-station/ \
		--no-owner --no-group \
		--delete \
		--exclude=.git \
		--exclude='*.swp' \
		--exclude=Makefile
