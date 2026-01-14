import re
from structured_drug_db import get_drug_by_name, get_equipment_by_name, EQUIPMENT
from fuzzywuzzy import process

def _fuzzy_match_name(name, db_dict, threshold=80):
    """
    Finds the best fuzzy match for a name in a given database dictionary.
    Returns the key of the best match if the score is above the threshold, otherwise returns None.
    """
    if not name or not db_dict:
        return None
    
    # Process the name against all keys in the dictionary
    # Use only keys for matching
    best_match = process.extractOne(name, db_dict.keys())
    
    if best_match and best_match[1] >= threshold:
        return best_match[0]
    return None

def _format_contents(contents):
    """Formats the contents from the database correctly."""
    if isinstance(contents, list):
        return ', '.join(contents)
    if isinstance(contents, str):
        return contents # Keep single string contents as is
    return 'N/A'

def _map_form(form_text):
    """Maps common form abbreviations to full names."""
    if form_text:
        form_text = form_text.lower()
        if form_text in ['tab', 'tablet']:
            return 'Tablet'
        if form_text in ['capsul', 'cap']:
            return 'Capsule'
        if form_text in ['syr', 'sirup', 'ml']:
            return 'Syrup'
        if form_text in ['mg', 'g']:
            return form_text.upper() # Return MG or G as is
    return form_text.upper() if form_text else 'N/A'


def _parse_racikan(prescription_text):
    """
    Parses a single 'racikan' (concoction) prescription line.
    
    Args:
        prescription_text (str): The text of the racikan prescription.

    Returns:
        list: A list of dictionaries, one for each drug in the racikan,
              or None if parsing fails.
    """
    racikan_entities = []
    
    # Define regex for a legacy racikan block
    racikan_regex = re.compile(r'(.*)\s(m\.f\.pulv dtd No\. XX|Racikan)\s*:\s*([\d\.]+)\s*:\s*(.*)', re.IGNORECASE)
    
    match = racikan_regex.search(prescription_text)
    
    if not match:
        return None

    drugs_text = match.group(1).strip()
    quantity_text = match.group(3).strip()
    usage_rule_text = match.group(4).strip()
    original_text = prescription_text.strip()
    
    # Split the drugs text by common separators
    # Regex: (NUMBER with /) (UNIT)
    drug_parts_raw = re.split(r'(\d+(?:/\d+)?)\s*(\w+)', drugs_text, flags=re.IGNORECASE)
    
    drugs_list = []
    current_drug_info = {'name': '', 'strength': '', 'form': ''}
    
    for i in range(len(drug_parts_raw)):
        part = drug_parts_raw[i].strip()
        if not part:
            continue
        
        # If part is text (drug name)
        if not re.match(r'^[\d/\.]+$', part) and not re.match(r'^(mg|tablet|tab|ml|syr|syr\.|chewibel|capsul)$', part, re.IGNORECASE):
            # If we just finished a drug entry, start a new one
            if current_drug_info['strength'] and current_drug_info['form']:
                drugs_list.append(current_drug_info)
                current_drug_info = {'name': '', 'strength': '', 'form': ''}
            current_drug_info['name'] += (' ' + part if current_drug_info['name'] else part)
            current_drug_info['name'] = current_drug_info['name'].strip()
        
        # If part is dosage (number/fraction)
        elif re.match(r'^\d+(?:/\d+)?$', part):
            current_drug_info['strength'] = part
            
        # If part is form (unit)
        elif re.match(r'^(mg|tablet|tab|ml|syr|syr\.|chewibel|capsul)$', part, re.IGNORECASE):
            current_drug_info['form'] = _map_form(part)

    # Add the last processed drug if complete
    if current_drug_info['name'] and current_drug_info['strength']:
        drugs_list.append(current_drug_info)

    # Process each drug found in the concoction
    for drug in drugs_list:
        drug_name_clean = re.sub(r'[\*\-,]+', '', drug['name'], flags=re.IGNORECASE).strip()
        
        # Use database data as the source of truth
        db_drug = get_drug_by_name(drug_name_clean)
        
        racikan_entities.append({
            'drugName': (db_drug.name if db_drug else drug_name_clean) + ' (Racikan)',
            'genericName': 'Racikan (Concoction)',
            'strength': f"{drug['strength']} {drug['form']}",
            'form': drug['form'],
            'quantity': quantity_text,
            'usageRule': usage_rule_text,
            # Populate contents from DB and format correctly
            'contents': _format_contents(db_drug.contents) if db_drug else 'N/A',
            'originalText': original_text,
            'type': 'racikan'
        })
    
    return racikan_entities

# --- MODIFIED FUNCTION ---
def _parse_embedded_racikan(name_part, details_part, original_text):
    """
    Parses a "racikan" (concoction) where the ingredients are
    embedded in the name part, e.g.:
    [Drug A 1/4 tab Drug B 0,8mg m.f.pulv] : [10.00] : [3 dd 1]
    """
    racikan_entities = []
    
    # 1. Parse details for overall quantity and usage rule
    quantity = 'N/A'
    usage_rule = 'N/A'
    details_pattern = re.compile(r'([\d\.]+)\s*:\s*(.*)')
    match = details_pattern.search(details_part)
    if match:
        quantity = match.group(1).strip() # e.g., 10.00
        usage_rule = match.group(2).strip() # e.g., 3 dd 1 bungkus
    else:
        usage_rule = details_part # Fallback
    
    # 2. Split name_part into drug list and racikan instructions
    # Split at the *first* occurrence of 'm.f.pulv' or 'racikan'
    split_match = re.split(r'(m\.f\.pulv|racikan)', name_part, maxsplit=1, flags=re.IGNORECASE)
    
    if len(split_match) < 3:
        # Failed to split, can't parse
        return None 
    
    drugs_text = split_match[0].strip()
    
    # 3. Parse the drugs_text
    # --- FIX: Using the original, robust state-machine logic ---
    drug_parts_raw = re.split(r'(\d+(?:[\.,/]\d+)?)\s*(\w+)', drugs_text, flags=re.IGNORECASE)
    
    drugs_list = []
    current_drug_info = {'name': '', 'strength': '', 'form': ''}
    
    for i in range(len(drug_parts_raw)):
        part = drug_parts_raw[i].strip()
        if not part:
            continue
        
        # If part is text (drug name)
        if not re.match(r'^[\d\.,/]+$', part) and not re.match(r'^(mg|tablet|tab|ml|syr|syr\.|chewibel|capsul)$', part, re.IGNORECASE):
            # If we just finished a drug entry, start a new one
            if current_drug_info['strength'] and current_drug_info['form']:
                drugs_list.append(current_drug_info)
                current_drug_info = {'name': '', 'strength': '', 'form': ''}
            current_drug_info['name'] += (' ' + part if current_drug_info['name'] else part)
            current_drug_info['name'] = current_drug_info['name'].strip()
        
        # If part is dosage (number/fraction)
        elif re.match(r'^\d+(?:[\.,/]\d+)?$', part):
            current_drug_info['strength'] = part
            
        # If part is form (unit)
        elif re.match(r'^(mg|tablet|tab|ml|syr|syr\.|chewibel|capsul)$', part, re.IGNORECASE):
            current_drug_info['form'] = _map_form(part)

    # Add the last processed drug if complete
    if current_drug_info['name'] and current_drug_info['strength']:
        drugs_list.append(current_drug_info)
    # --- END FIX ---

    # 4. Process each drug found in the concoction
    for drug in drugs_list:
        drug_name_clean = re.sub(r'[\*\-,]+', '', drug['name'], flags=re.IGNORECASE).strip()
        
        # Use database data as the source of truth
        db_drug = get_drug_by_name(drug_name_clean)
        
        racikan_entities.append({
            'drugName': (db_drug.name if db_drug else drug_name_clean) + ' (Racikan)',
            'genericName': 'Racikan (Concoction)',
            'strength': f"{drug['strength']} {drug['form']}",
            'form': drug['form'],
            'quantity': quantity, # The overall quantity (e.g., 10.00)
            'usageRule': usage_rule, # The overall usage rule
            'contents': _format_contents(db_drug.contents) if db_drug else 'N/A',
            'originalText': original_text,
            'type': 'racikan'
        })
    
    return racikan_entities

def _parse_equipment(prescription_text):
    """
    Parses a medical equipment prescription line using the database.
    
    Args:
        prescription_text (str): The text of the equipment prescription.

    Returns:
        dict: A dictionary of parsed equipment details, or None if parsing fails.
    """
    # 1. Isolate the Name Part (Assume name is before the first colon)
    name_part_raw = prescription_text.split(':', 1)[0].strip()
    
    # --- 2. Clean Name for Lookup ---
    name_cleaned = re.sub(r'[\*\-,]+|\s*(SYR|ML|TAB|CAPSUL|ANS)\b', '', name_part_raw, flags=re.IGNORECASE).strip()
    
    # 3. Database Lookup (Handles fuzzy matching internally)
    equipment_db_entry = get_equipment_by_name(name_cleaned)

    if not equipment_db_entry:
        return None
    
    # 4. Extract Details from the rest of the string
    
    # Isolate the numeric details part (everything after the name and colon)
    # This regex is robust for the format: :37.00:1/2 cun=13 mm
    details_match = re.search(r'[:\s]*([\d\.]+)\s*[:\s]*(.*)', prescription_text.replace(name_part_raw, '', 1))
    
    quantity_raw = 'N/A'
    size_raw = 'N/A'

    if details_match:
        # First group is the quantity number (e.g., 37.00)
        quantity_raw = details_match.group(1).strip()
        
        # Second group is the remaining size/unit info (e.g., 1/2 cun=13 mm)
        size_raw = details_match.group(2).strip() or 'N/A'
    
    
    # 5. Build Final Result: Note the key change here from 'equipmentName' to 'name'
    return {
        'name': equipment_db_entry.name,
        'type': equipment_db_entry.type,
        'size': size_raw,
        'quantity': quantity_raw,
        'originalText': prescription_text,
        'type': 'equipment'
    }

# --- (This function remains the same as the last version) ---
def _parse_separate_drug(prescription_text):
    """
    Parses a single, non-racikan drug prescription line.
    
    Args:
        prescription_text (str): The text of the drug prescription.

    Returns:
        dict: A dictionary of parsed drug details, or None if parsing fails.
              OR
        list: A list of dictionaries if it's an embedded racikan.
    """
    # --- Step 1: Initialize and Clean Input ---
    drug_name = 'N/A'
    generic_name = 'N/A'
    strength = 'N/A'
    form = 'N/A'
    quantity = 'N/A'
    usage_rule = 'N/A'
    contents = 'N/A'
    
    # Split the prescription text by the colon to separate name and details
    parts = prescription_text.split(':', 1)
    if len(parts) != 2:
        return None # Not a valid single drug entry

    drug_name_part = parts[0].strip()
    details_part = parts[1].strip()
    
    # --- NEW: Check for embedded racikan keywords ---
    racikan_keywords = ['m.f.pulv', 'racikan']
    if any(keyword in drug_name_part.lower() for keyword in racikan_keywords):
        # This entry is an embedded racikan, pass it to the new parser
        # It will return a LIST of drug dicts
        return _parse_embedded_racikan(drug_name_part, details_part, prescription_text)
    # --- END NEW CHECK ---

    # --- Step 2: Aggressive Pre-Cleanse (Remove all unit/form/label noise) ---
    
    # Aggressive pattern to capture dosage (number + unit) and form (word) info
    # Captures: 1. number/fraction, 2. unit (mg/g), 3. form (tablet/capsul)
    dosage_form_pattern = r'(\d+(?:/\d+)?|\d+)\s*(mg|g|tablet|tab|syr|syr\.|ml|cth|kapsul|capsul)\s*'
    
    # Pattern to remove final labels/separators (ANS, TAB, HEXPHARM, etc.)
    label_pattern = r'[\*\-,]+|\s*(TAB|CAPSUL|SYR|ML|ANS|TABLET|KAPSUL)\b' 
    
    # Start with the raw part, we will use regex to clean the name for lookup
    drug_name_cleaned = drug_name_part

    # Remove all dosage/unit/form words to get a clean name for fuzzy matching
    drug_name_cleaned = re.sub(dosage_form_pattern, '', drug_name_cleaned, flags=re.IGNORECASE).strip()
    
    # Remove labels/separators to get the cleanest possible name (e.g., 'AMLODIPIN HEXPHARM')
    drug_name_cleaned = re.sub(label_pattern, '', drug_name_cleaned, flags=re.IGNORECASE).strip()


    # --- Step 3: Database Lookup (Source of Truth) ---
    drug_db_entry = get_drug_by_name(drug_name_cleaned)
    
    # --- Step 4: Extract Dosage and Populate Fields ---
    if drug_db_entry:
        # Populate Name, Generic, Contents directly from DB (Source of Truth)
        drug_name = drug_db_entry.name
        generic_name = drug_db_entry.generic
        contents = _format_contents(drug_db_entry.contents)
        
        # --- Dosage Extraction from Original Text ---
        # Find the dosage number and unit in the original raw text
        raw_dosage_match = re.search(r'(\d+(?:/\d+)?|\d+)\s*(mg|g|tablet|tab|syr|syr\.|ml|cth|kapsul|capsul)\s*', drug_name_part, flags=re.IGNORECASE)
        
        if raw_dosage_match:
            strength_value = raw_dosage_match.group(1).strip()
            strength_unit = raw_dosage_match.group(2).strip()
            
            # Look for explicit form word immediately following (e.g., '5 MG TAB')
            end_pos = raw_dosage_match.end()
            remaining_text = drug_name_part[end_pos:].strip()
            form_word_match = re.match(r'^(TABLET|TAB|CAPSUL|CAP)\b', remaining_text, flags=re.IGNORECASE)
            
            if form_word_match:
                # Case: 5 MG TAB -> Strength: 5 MG, Form: Tablet/Capsule
                form = _map_form(form_word_match.group(1))
                strength = f"{strength_value} {strength_unit.upper()}"
            else:
                # Case: 60 ML or 800 MG (Unit is the implicit form)
                form = _map_form(strength_unit) 
                strength = f"{strength_value} {strength_unit.upper()}"
        
        # --- Liquid Form Correction (OBH KACA, BUFECT) ---
        if 'syrup' in generic_name.lower() or 'liquiritiae' in generic_name.lower():
            # Standardize Form
            form = 'Botol Syrup'
            # Look for ML size (e.g., 60 ML, 100 ML)
            size_match = re.search(r'(\d+)\s*ML', drug_name_part, re.IGNORECASE)
            if size_match:
                strength = f"{size_match.group(1)} ML" 
                
    else:
        # Fallback if no database match: use the best cleaned name, but data will be N/A
        drug_name = drug_name_cleaned
        generic_name = 'N/A'
        
    # --- Step 5: Parsing Quantity and Usage Rule from Details Part ---
    # Example: 1.00:3 dd Cth 1
    details_pattern = re.compile(r'([\d\.]+)\s*:\s*(.*)')
    match = details_pattern.search(details_part)

    if match:
        quantity = match.group(1).strip()
        usage_rule = match.group(2).strip()
    else:
        # Fallback: Use the whole details part as usage rule if no structure is found
        usage_rule = details_part
        
    # Return a single DICT
    return {
        'drugName': drug_name,
        'genericName': generic_name,
        'strength': strength,
        'form': form,
        'quantity': quantity,
        'usageRule': usage_rule,
        'contents': contents,
        'originalText': prescription_text,
        'type': 'separate_drug'
    }


# --- (This function remains the same as the last version) ---
def ner_drug_prescription(prescription_text):
    """
    Main NER function to parse and categorize a full prescription.
    """
    parsed_data = {
        'racikan': [],
        'separate_drugs': [],
        'equipment': []
    }
    
    # Split the entire prescription string by semicolons to handle multiple entries
    entries = [entry.strip() for entry in prescription_text.split(';') if entry.strip()]

    # Process each entry sequentially
    for entry in entries:
        
        # 1. Check for equipment first
        equipment_result = _parse_equipment(entry)
        if equipment_result:
            parsed_data['equipment'].append(equipment_result)
            continue
        
        # 2. Check for separate drug OR embedded racikan
        # _parse_separate_drug will now handle both
        separate_drug_result = _parse_separate_drug(entry)
        
        # It might return a single dict (drug) or a list (racikan)
        if separate_drug_result:
            if isinstance(separate_drug_result, list):
                # This was an embedded racikan
                parsed_data['racikan'].extend(separate_drug_result)
            elif separate_drug_result['drugName'] and separate_drug_result['drugName'] not in ['N/A', '']:
                # This was a separate drug
                parsed_data['separate_drugs'].append(separate_drug_result)
            continue # Move to next entry
            
        # 3. Check for legacy racikan format (e.g., "Racikan : ...")
        # This is now a fallback for older formats
        racikan_result = _parse_racikan(entry)
        if racikan_result:
            parsed_data['racikan'].extend(racikan_result)
            continue

    return parsed_data