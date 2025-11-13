require('arrow')
require('dplyr')
require("readxl")
require("purrr")

setwd('~/Documents/Ownership')

workbook_path <- 'Global-Energy-Ownership-Tracker-March-2025.xlsx'
sheet_names <- excel_sheets(workbook_path)
sheet_names

# Load sheets 2 and 3, which will be there own tables in our mini db.  
entitites <- read_excel(workbook_path, 'All Entities')
ownership <- read_excel(workbook_path, 'Entity Ownership')

# Grab names for worksheets that are ownership of different tracker items
tracker_sheets_names <- sheet_names[4:length(sheet_names)]

trackers_ownership_list <- tracker_sheets_names %>%
  map(\(x) read_excel(workbook_path, x))

all_trackers_ownership <- trackers_ownership_list %>%
  map2(tracker_sheets_names, ~ mutate(.x, Tracker = sub(' Ownership','',.y)))  %>%
  bind_rows()

# Write parquet files
arrow::write_parquet(entitites, 'entitites.parquet')
arrow::write_parquet(ownership, 'ownership.parquet')
arrow::write_parquet(all_trackers_ownership, 'all_trackers_ownership.parquet')

