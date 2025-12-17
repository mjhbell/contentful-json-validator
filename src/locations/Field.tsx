import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { FieldAppSDK } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import { Note, Paragraph, List, ListItem, Spinner } from '@contentful/f36-components';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import Ajv from 'ajv';

// Initialize AJV validator
const ajv = new Ajv({ allErrors: true });

// --- Helper: Format AJV errors into human-readable messages ---
const formatErrorMessage = (err: any) => {
  let fieldPath = err.instancePath;

  if (err.keyword === 'required') {
    const missingProperty = err.params.missingProperty;
    fieldPath = fieldPath ? `${fieldPath}/${missingProperty}` : `/${missingProperty}`;
  }

  let displayPath = fieldPath
    .replace(/^\//, '') 
    .replace(/\//g, ' › ')
    .replace(/(^| › )(\d+)(?=$| › )/g, '$1Item $2');

  if (!displayPath) displayPath = 'Document';

  let message = err.message;
  
  if (err.keyword === 'required') message = 'is required';
  else if (err.keyword === 'type') message = `must be ${err.params.type}`; 
  else if (err.keyword === 'minItems') message = `must have at least ${err.params.limit} items`;
  else if (err.keyword === 'minimum') message = `must be ${err.params.limit} or higher`;
  else if (err.keyword === 'enum') message = `must be one of: ${err.params.allowedValues.join(', ')}`;

  return `**${displayPath}** ${message}`;
};

const JsonSchemaField = () => {
  const sdk = useSDK<FieldAppSDK>();
  
  // --- State Management ---
  const [value, setValue] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [externalSchema, setExternalSchema] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  
  const schemaFieldId = sdk.parameters.instance.schemaRefFieldId || 'schemaDefinition';

  // --- 1. Fetch Schema Logic ---
  const fetchSchemaContent = useCallback(async (entryId: string) => {
    // LOCK IMMEDIATELY: Start loading = Invalid
    setIsLoading(true);
    sdk.field.setInvalid(true); 

    try {
      setStatusMessage('Loading Schema...');
      const entry = await sdk.cma.entry.get({ entryId });
      const defaultLocale = sdk.locales.default;
      const schemaData = entry.fields.schema?.[defaultLocale];
      
      if (schemaData) {
        setExternalSchema(schemaData);
        setStatusMessage('');
      } else {
        setExternalSchema(null);
        setStatusMessage('Selected entry has no JSON schema content.');
      }
    } catch (error) {
      console.error(error);
      setExternalSchema(null);
      setStatusMessage('Failed to load linked Schema entry.');
    } finally {
      setIsLoading(false);
    }
  }, [sdk]);

  // --- 2. Watch Sibling Field ---
  useEffect(() => {
    // LOCK IMMEDIATELY on Mount
    sdk.field.setInvalid(true);

    const siblingField = sdk.entry.fields[schemaFieldId];

    if (!siblingField) {
      setStatusMessage(`Configuration Error: Sibling field "${schemaFieldId}" not found.`);
      setIsLoading(false);
      return;
    }

    const currentLink = siblingField.getValue();
    if (currentLink?.sys?.id) {
      fetchSchemaContent(currentLink.sys.id);
    } else {
      setStatusMessage('Please select a Schema reference above.');
      setExternalSchema(null);
      setIsLoading(false);
      // Ensure invalid if no schema
      sdk.field.setInvalid(true);
    }

    const detach = siblingField.onValueChanged((val) => {
      if (val?.sys?.id) {
        fetchSchemaContent(val.sys.id);
      } else {
        setExternalSchema(null);
        setStatusMessage('Please select a Schema reference above.');
        setIsLoading(false);
        sdk.field.setInvalid(true);
      }
    });
    
    return () => detach();
  }, [sdk, schemaFieldId, fetchSchemaContent]);

  // --- 3. Compile Validator ---
  const validate = useMemo(() => {
    if (!externalSchema) return null;
    try {
      return ajv.compile(externalSchema);
    } catch (e) {
      setStatusMessage('Error: The referenced JSON Schema is invalid.');
      return null;
    }
  }, [externalSchema]);

  // --- 4. Validation Engine ---
  const runValidation = useCallback((jsonString: string, validator: any, loading: boolean) => {
    // If loading or no validator, we must remain INVALID
    if (loading || !validator) {
      sdk.field.setInvalid(true);
      return; 
    }

    try {
      const parsedJson = JSON.parse(jsonString);
      
      const isValid = validator(parsedJson);
      if (!isValid) {
        // Validation Failed -> BLOCK PUBLISH
        const formattedErrors = validator.errors?.map(formatErrorMessage) || ['Unknown error'];
        setErrors(formattedErrors);
        sdk.field.setInvalid(true);
      } else {
        // Validation Passed -> ALLOW PUBLISH
        setErrors([]);
        sdk.field.setInvalid(false);
        sdk.field.setValue(parsedJson);
      }
    } catch (e) {
      // Syntax Error -> BLOCK PUBLISH
      setErrors(['Syntax Error: Check your JSON format']);
      sdk.field.setInvalid(true);
    }
  }, [sdk]);

  // --- 5. Initial Load Handler ---
  useEffect(() => {
    const contentfulValue = sdk.field.getValue();
    const initialString = contentfulValue ? JSON.stringify(contentfulValue, null, 2) : '';
    setValue(initialString);
    sdk.window.startAutoResizer();
    
    // CRITICAL: Even if we have a value, check if we are ready to validate it.
    // If not ready (loading or no schema), we default to invalid.
    if (validate && !isLoading) {
      runValidation(initialString, validate, isLoading);
    } else {
      sdk.field.setInvalid(true);
    }
  }, [sdk, validate, isLoading, runValidation]);

  // --- 6. Editor Change Handler ---
  const onChange = useCallback((val: string) => {
    setValue(val);
    runValidation(val, validate, isLoading);
  }, [runValidation, validate, isLoading]);

  // --- 7. Render ---
  return (
    <div style={{ minHeight: '150px' }}>
      
      {isLoading ? (
        <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Spinner /> <Paragraph>Loading Schema...</Paragraph>
        </div>
      ) : statusMessage && (
        <Note variant="primary" style={{ marginBottom: '10px' }}>
          {statusMessage}
        </Note>
      )}

      <CodeMirror
        value={value}
        height="300px"
        extensions={[json()]}
        onChange={onChange}
        theme="light"
        style={{ 
          border: errors.length > 0 ? '1px solid #da3e3e' : '1px solid #d3dce0', 
          borderRadius: '4px',
          opacity: (externalSchema || isLoading) ? 1 : 0.5,
          pointerEvents: (externalSchema || isLoading) ? 'auto' : 'none'
        }}
      />

      {errors.length > 0 && !isLoading && (
        <Note variant="negative" style={{ marginTop: '12px' }}>
          <Paragraph><strong>Please fix the following issues:</strong></Paragraph>
          <List>
            {errors.map((error, index) => (
              <ListItem key={index}>
                 <span dangerouslySetInnerHTML={{ 
                    __html: error.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                 }} />
              </ListItem>
            ))}
          </List>
        </Note>
      )}
    </div>
  );
};

export default JsonSchemaField;