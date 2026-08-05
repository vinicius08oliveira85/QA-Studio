import React from 'react';
import { Select } from './ui.jsx';

export const ENVIRONMENTS = ['Homologação', 'Staging', 'Produção', 'Local'];

export default function EnvSelect(props) {
  const current = props.value;
  const options = current && !ENVIRONMENTS.includes(current) ? [...ENVIRONMENTS, current] : ENVIRONMENTS;
  return (
    <Select {...props}>
      {options.map((e) => <option key={e} value={e}>{e}</option>)}
    </Select>
  );
}
