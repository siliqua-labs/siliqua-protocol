# GRI v1.0 amendments

`gri-v1.0.md` is registered by hash and `index-engine` refuses to start if the file changes. Changes are recorded here until a new methodology version replaces it.

## 2026-11-26: median

Decision: after the outlier filter, GRI is the weighted median of the kept quotes, not the weighted mean in step 7 of section 4. With equal weights this is the median: the middle value, or for an even count the mean of the two middle values, rounded half up to the micro-USD. It replaces open item 1 of section 10.

Applies from `siliqua-index` 0.2.0. Hours stored by 0.1.0 used the mean and are not rewritten.
